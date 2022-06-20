import * as path from 'path';
import type { ApiClient } from '@becomes/cms-cloud-client/types';
import type { Args } from './types';
import { prompt } from 'inquirer';
import { createTasks } from '@banez/npm-tool';
import { ChildProcess } from '@banez/child_process';
import { createSdk3, Select } from './util';
import type { BCMSApiKey } from '@becomes/cms-sdk/types';
import { createFS } from '@banez/fs';

export class Website {
  static async resolve({
    args,
    client,
  }: {
    args: Args;
    client: ApiClient;
  }): Promise<void> {
    if (args.website === 'create') {
      await Website.create({ args, client });
    }
  }

  static async create({
    client,
  }: {
    args: Args;
    client: ApiClient;
  }): Promise<void> {
    const answers = await prompt<{
      projectName: string;
      projectType: string;
    }>([
      {
        name: 'projectName',
        message: 'Enter a project name',
        type: 'input',
        default: 'my-bcms-website',
      },
      {
        name: 'projectType',
        message: 'Select a framework',
        type: 'list',
        choices: ['Next', 'Nuxt', 'Gatsby'],
        default: 'Next',
      },
    ]);
    const repoBase = path.join(process.cwd(), answers.projectName);
    const repoFs = createFS({
      base: repoBase,
    });
    await createTasks([
      {
        title: 'Clone starter project',
        task: async () => {
          await ChildProcess.spawn('git', [
            'clone',
            `https://github.com/becomesco/cms-${
              answers.projectType === 'Next'
                ? 'next'
                : answers.projectType === 'Nuxt'
                ? 'nuxt'
                : 'gatsby'
            }-starter`,
            answers.projectName,
          ]);
        },
      },
      {
        title: 'Connect with your BCMS',
        task: async () => {
          const connect = await prompt<{ yes: boolean }>([
            {
              message: 'Would you like to connect with you BCMS?',
              type: 'confirm',
              name: 'yes',
            },
          ]);
          if (connect.yes) {
            const { instance } = await Select.orgAndInstance({ client });
            const apiOrigin = `https://${instance.domains[0]}`;
            const sdk = createSdk3({
              origin: apiOrigin,
            });
            const otp = await client.user.getOtp();
            await sdk.shim.verify.otp(otp);
            const apiKeys = await sdk.apiKey.getAll();
            let apiKey: BCMSApiKey | undefined;
            if (apiKeys.length > 0) {
              const selectedKey = await prompt<{ id: string }>([
                {
                  message: 'Select an API Key you would like to use',
                  type: 'list',
                  name: 'id',
                  choices: [
                    ...apiKeys.map((e) => {
                      return {
                        name: e.name,
                        value: e._id,
                      };
                    }),
                    {
                      name: 'Create new API key',
                      value: '',
                    },
                  ],
                },
              ]);
              if (selectedKey.id) {
                apiKey = apiKeys.find(
                  (e) => e._id === selectedKey.id,
                ) as BCMSApiKey;
              }
            }
            if (!apiKey) {
              const templates = await sdk.template.getAll();
              apiKey = await sdk.apiKey.create({
                access: {
                  templates: templates.map((template) => {
                    return {
                      _id: template._id,
                      name: template.name,
                      get: true,
                      delete: false,
                      post: false,
                      put: false,
                    };
                  }),
                  functions: [],
                },
                blocked: false,
                desc: 'This is an API key created automatically by the BCMS CLI.',
                name: 'Development key',
              });
            }
            let additionalEnvVars: string[] = [];
            if (answers.projectType === 'Next') {
              additionalEnvVars = [
                `NEXT_PUBLIC_BCMS_API_ORIGIN=${apiOrigin}`,
                `NEXT_PUBLIC_BCMS_API_PUBLIC_KEY_ID=${apiKey._id}`,
              ];
            } else if (answers.projectType === 'Nuxt') {
              additionalEnvVars = [
                `NUXT_ENV_BCMS_API_ORIGIN=${apiOrigin}`,
                `NUXT_ENV_BCMS_API_PUBLIC_KEY=${apiKey._id}`,
              ];
            } else if (answers.projectType === 'Gatsby') {
              additionalEnvVars = [
                `GATSBY_BCMS_API_ORIGIN=${apiOrigin}`,
                `GATSBY_BCMS_API_PUBLIC_KEY=${apiKey._id}`,
              ];
            }
            await repoFs.save(
              answers.projectType === 'Gatsby' ? '.env.development' : '.env',
              [
                `BCMS_API_ORIGIN=${apiOrigin}`,
                `BCMS_API_KEY=${apiKey._id}`,
                `BCMS_API_SECRET=${apiKey.secret}`,
                '',
                ...additionalEnvVars,
              ].join('\n'),
            );
          }
        },
      },
      {
        title: 'Install dependencies',
        task: async () => {
          await ChildProcess.spawn('npm', ['i'], {
            stdio: 'inherit',
            cwd: repoBase,
          });
        },
      },
    ]).run();
  }
}