import * as path from 'path';
import { BCMSClient as BCMSClientV2 } from '../../bcms-client-v2';
import { v4 as uuidv4 } from 'uuid';
import { createFS } from '@banez/fs';
import { ChildProcess } from '@banez/child_process';
import { Args, getCmsInfo } from '../util';
import type { ChildProcessOnChunkHelperOutput } from '@banez/child_process/types';
import { prompt } from 'inquirer';
import {
  ApiKeyV2,
  ApiKeyV3,
  EntryV2,
  EntryV3,
  EntryV3Content,
  EntryV3ContentNode,
  EntryV3ContentNodeMarker,
  EntryV3ContentNodeMarkerType,
  EntryV3ContentNodeType,
  EntryV3Meta,
  GroupV2,
  GroupV3,
  IdCounterV3,
  LanguageV2,
  LanguageV3,
  MediaV2,
  MediaV2Type,
  MediaV3,
  MigrationConfig,
  PropV2,
  PropV2EntryPointer,
  PropV2Enum,
  PropV2GroupPointer,
  PropV2Quill,
  PropV2QuillOption,
  PropV2Type,
  PropV3,
  PropV3EntryPointerData,
  PropV3EnumData,
  PropV3GroupPointerData,
  PropV3MediaData,
  PropV3Type,
  PropV3Value,
  PropV3ValueGroupPointerData,
  PropV3ValueWidgetData,
  TemplateV2,
  TemplateV3,
  WidgetV2,
  WidgetV3,
} from '../types';
import {
  Terminal,
  createTerminalProgressBar,
  createTerminalList,
  createTerminalTitle,
} from '../terminal';

function nodeToText({ node }: { node: EntryV3ContentNode }) {
  let output = '';
  if (node.type === 'widget') {
    const attrs = node.attrs as PropV3ValueWidgetData;
    output += '__widget' + JSON.stringify(attrs);
  } else {
    if (node.type === EntryV3ContentNodeType.text && node.text) {
      output += node.text;
    } else if (node.type === EntryV3ContentNodeType.paragraph && node.content) {
      output += `${node.content
        .map((childNode) => nodeToText({ node: childNode }))
        .join('')}\n`;
    } else if (
      node.type === EntryV3ContentNodeType.heading &&
      node.attrs &&
      node.content
    ) {
      output += `${node.content
        .map((childNode) => nodeToText({ node: childNode }))
        .join('')}`;
    } else if (
      node.type === EntryV3ContentNodeType.bulletList &&
      node.content
    ) {
      output += `${node.content
        .map((childNode) => nodeToText({ node: childNode }))
        .join('')}`;
    } else if (node.type === EntryV3ContentNodeType.listItem && node.content) {
      output += `${node.content
        .map((childNode) => nodeToText({ node: childNode }))
        .join('')}`;
    } else if (
      node.type === EntryV3ContentNodeType.orderedList &&
      node.content
    ) {
      output += `${node.content
        .map((childNode) => nodeToText({ node: childNode }))
        .join('')}`;
    } else if (node.type === EntryV3ContentNodeType.codeBlock && node.content) {
      output += `${node.content
        .map((childNode) => nodeToText({ node: childNode }))
        .join('')}`;
    }
  }
  return output;
}

export class Migration {
  private static basePath = path.join(process.cwd(), 'migration');
  private static fs = createFS({
    base: this.basePath,
  });
  private static collectionNames = {
    v2: [
      '_api_keys',
      '_languages',
      '_medias',
      '_statuses',
      '_users',
      '_groups',
      '_templates',
      '_widgets',
      '_entries',
    ],
    v2v3Map: {
      _api_keys: '_api_keys',
      _entries: '_entries',
      _groups: '_groups',
      _languages: '_languages',
      _medias: '_medias',
      _statuses: '_statuses',
      _templates: '_templates',
      _users: '_users',
      _widgets: '_widgets',
    },
    v3: [
      '_api_keys',
      '_changes',
      '_colors',
      '_entries',
      '_groups',
      '_id_counters',
      '_languages',
      '_medias',
      '_statuses',
      '_tags',
      '_template_organizers',
      '_templates',
      '_users',
      '_widgets',
    ],
  };

  private static getPrefix({
    args,
    migrationConfig,
  }: {
    args: Args;
    migrationConfig: MigrationConfig;
  }): [string, string] {
    const prfx = args.collectionPrfx
      ? args.collectionPrfx
      : migrationConfig.database &&
        migrationConfig.database.from &&
        migrationConfig.database.from.collectionPrefix
      ? migrationConfig.database.from.collectionPrefix
      : 'bcms';
    const toPrfx = args.toCollectionPrfx
      ? args.toCollectionPrfx
      : migrationConfig.database &&
        migrationConfig.database.to &&
        migrationConfig.database.to.collectionPrefix
      ? migrationConfig.database.to.collectionPrefix
      : prfx;
    return [prfx, toPrfx];
  }
  static get media(): {
    v2(data: { inputMedia: MediaV2; v2Media: MediaV2[] }): MediaV3;
  } {
    return {
      v2({ inputMedia, v2Media }) {
        const output: MediaV3 = {
          _id: inputMedia._id.$oid,
          createdAt: inputMedia.createdAt,
          updatedAt: inputMedia.updatedAt,
          altText: '',
          caption: '',
          __v: 0,
          hasChildren: inputMedia.hasChildren,
          height: -1,
          width: -1,
          isInRoot: false,
          mimetype: inputMedia.mimetype,
          name: inputMedia.name,
          parentId: '',
          size: inputMedia.size,
          type: inputMedia.type as never,
          userId: inputMedia.userId,
        };
        if (inputMedia.isInRoot) {
          output.isInRoot = true;
        } else {
          const pathParts = inputMedia.path.split('/').slice(1);
          if (pathParts.length > 0) {
            let parentMedia: MediaV2 | undefined = undefined;
            if (inputMedia.type === MediaV2Type.DIR) {
              const parentName = pathParts[pathParts.length - 2];
              parentMedia = v2Media.find((e) => e.name === parentName);
            } else {
              const parentName = pathParts[pathParts.length - 1];
              parentMedia = v2Media.find((e) => e.name === parentName);
            }
            if (parentMedia) {
              output.parentId = parentMedia._id.$oid;
            } else {
              output.isInRoot = true;
            }
          } else {
            output.isInRoot = true;
          }
        }
        return output;
      },
    };
  }
  static get props(): {
    v2(data: { inputProps: PropV2[]; v2Media: MediaV2[] }): PropV3[];
    v2Values(data: {
      prfx: string;
      inputProps: PropV2[];
      schemaProps: PropV3[];
    }): Promise<PropV3Value[]>;
  } {
    return {
      v2({ inputProps, v2Media }) {
        const output: PropV3[] = [];
        for (let i = 0; i < inputProps.length; i++) {
          const inputProp = inputProps[i];
          const outputProp: PropV3 = {
            array: inputProp.array,
            id: uuidv4(),
            label: inputProp.label,
            name: inputProp.name,
            required: inputProp.required,
            type: PropV3Type.STRING,
            defaultData: [],
          };
          if (inputProp.type === PropV2Type.STRING) {
            outputProp.type = PropV3Type.STRING;
            outputProp.defaultData = inputProp.value as string[];
          } else if (inputProp.type === PropV2Type.NUMBER) {
            outputProp.type = PropV3Type.NUMBER;
            outputProp.defaultData = inputProp.value as number[];
          } else if (inputProp.type === PropV2Type.BOOLEAN) {
            outputProp.type = PropV3Type.BOOLEAN;
            outputProp.defaultData = inputProp.value as boolean[];
          } else if (inputProp.type === PropV2Type.DATE) {
            outputProp.type = PropV3Type.DATE;
            outputProp.defaultData = inputProp.value as number[];
          } else if (inputProp.type === PropV2Type.ENTRY_POINTER) {
            outputProp.type = PropV3Type.ENTRY_POINTER;
            const value = inputProp.value as PropV2EntryPointer;
            outputProp.defaultData = {
              templateId: value.templateId,
              entryIds: value.entryIds,
              displayProp: 'title',
            } as PropV3EntryPointerData;
          } else if (inputProp.type === PropV2Type.ENUMERATION) {
            outputProp.type = PropV3Type.ENUMERATION;
            const value = inputProp.value as PropV2Enum;
            outputProp.defaultData = {
              items: value.items,
              selected: value.selected,
            } as PropV3EnumData;
          } else if (inputProp.type === PropV2Type.GROUP_POINTER) {
            outputProp.type = PropV3Type.GROUP_POINTER;
            const value = inputProp.value as PropV2GroupPointer;
            outputProp.defaultData = {
              _id: value._id,
            } as PropV3GroupPointerData;
          } else if (inputProp.type === PropV2Type.MEDIA) {
            outputProp.type = PropV3Type.MEDIA;
            const value = inputProp.value as string[];
            const defaultData: PropV3MediaData[] = [];
            for (let j = 0; j < value.length; j++) {
              const mediaPath = value[j];
              const media = v2Media.find(
                (e) => `${e.path}/${e.name}` === mediaPath,
              );
              if (media) {
                defaultData.push(media._id.$oid);
              }
            }
            outputProp.defaultData = defaultData;
          }
          output.push(outputProp);
        }
        return output;
      },
      async v2Values({ inputProps, schemaProps, prfx }) {
        const outputFs = createFS({
          base: path.join(Migration.basePath, 'v3_data'),
        });
        const outputProps: PropV3Value[] = [];
        for (let i = 0; i < schemaProps.length; i++) {
          const schemaProp = schemaProps[i];
          const inputProp = inputProps.find((e) => e.name === schemaProp.name);
          if (inputProp) {
            let pushProp = true;
            const outputProp: PropV3Value = {
              id: schemaProp.id,
              data: [],
            };
            if (
              inputProp.type === PropV2Type.STRING ||
              inputProp.type === PropV2Type.NUMBER ||
              inputProp.type === PropV2Type.BOOLEAN ||
              inputProp.type === PropV2Type.DATE
            ) {
              outputProp.data = inputProp.value as string[];
            } else if (inputProp.type === PropV2Type.ENTRY_POINTER) {
              const inputValue = inputProp.value as PropV2EntryPointer;
              outputProp.data = inputValue.entryIds;
            } else if (inputProp.type === PropV2Type.ENUMERATION) {
              const inputValue = inputProp.value as PropV2Enum;
              outputProp.data = [inputValue.selected || ''];
            } else if (inputProp.type === PropV2Type.GROUP_POINTER) {
              const inputValue = inputProp.value as PropV2GroupPointer;
              const groups: GroupV3[] = JSON.parse(
                await outputFs.readString(`${prfx}_groups.json`),
              );
              const group = groups.find((e) => e._id === inputValue._id);
              if (group) {
                const outputData: PropV3ValueGroupPointerData = {
                  _id: inputValue._id,
                  items: [],
                };
                for (let j = 0; j < inputValue.items.length; j++) {
                  const inputItem = inputValue.items[j];
                  outputData.items.push({
                    props: await Migration.props.v2Values({
                      prfx,
                      inputProps: inputItem.props,
                      schemaProps: group.props,
                    }),
                  });
                }
                outputProp.data = outputData;
              } else {
                pushProp = false;
              }
            } else if (inputProp.type === PropV2Type.MEDIA) {
              const inputValue = inputProp.value as string[];
              const allMedia: MediaV2[] = JSON.parse(
                await Migration.fs.readString([
                  'v2_data',
                  `${prfx}_medias.json`,
                ]),
              );
              const outputData: string[] = [];
              for (let j = 0; j < inputValue.length; j++) {
                const mediaPath = inputValue[j];
                const media = allMedia.find(
                  (e) =>
                    `${!e.isInRoot ? `${e.path}/` : ''}${e.name}` === mediaPath,
                );
                if (media) {
                  outputData.push(media._id.$oid);
                }
              }
              outputProp.data = outputData;
            } else {
              pushProp = false;
            }
            if (pushProp) {
              outputProps.push(outputProp);
            }
          }
        }
        return outputProps;
      },
    };
  }
  static get content(): {
    v2(data: {
      inputProps: PropV2[];
      prfx: string;
      lng: string;
    }): Promise<EntryV3ContentNode[]>;
    v2OpsToNode(data: {
      ops: PropV2QuillOption[];
      nodeType: EntryV3ContentNodeType;
    }): EntryV3ContentNode;
    v2OpAttrsToMarks(data: {
      attrs: {
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        strike?: boolean;
        list?: string;
        indent?: number;
        link?: string;
        header?: number;
      };
    }): EntryV3ContentNodeMarker[];
    v2ResolveList(data: {
      ops: PropV2QuillOption[];
      depth: number;
    }): EntryV3ContentNode;
  } {
    return {
      async v2({ inputProps }) {
        const output: EntryV3ContentNode[] = [];
        for (let i = 0; i < inputProps.length; i++) {
          const inputProp = inputProps[i];
          const inputValue = inputProp.value as PropV2Quill;
          if (inputProp.type.startsWith('HEADING_')) {
            const node: EntryV3ContentNode = {
              type: EntryV3ContentNodeType.heading,
              attrs: {
                level: parseInt(inputProp.type.replace('HEADING_', ''), 10),
              },
              content: [
                {
                  type: EntryV3ContentNodeType.text,
                  text: inputValue.ops
                    .map((e) => e.insert.replace(/\n/g, ''))
                    .join(' '),
                },
              ],
            };
            output.push(node);
          } else if (inputProp.type === PropV2Type.PARAGRAPH) {
            output.push(
              Migration.content.v2OpsToNode({
                ops: inputValue.ops,
                nodeType: EntryV3ContentNodeType.paragraph,
              }),
            );
          } else if (inputProp.type === PropV2Type.LIST) {
            const ops: PropV2QuillOption[] = [];
            for (let j = 1; j < inputValue.ops.length; j += 2) {
              const op = inputValue.ops[j];
              op.insert += inputValue.ops[j - 1].insert;
              if (!op.attributes || !op.attributes.indent) {
                op.attributes = {
                  indent: 0,
                  list: 'bullet',
                };
              }
              ops.push(op);
            }
            output.push(
              Migration.content.v2ResolveList({
                ops,
                depth: 0,
              }),
            );
          } else if (inputProp.type === PropV2Type.CODE) {
            output.push(
              Migration.content.v2OpsToNode({
                ops: inputValue.ops,
                nodeType: EntryV3ContentNodeType.codeBlock,
              }),
            );
          }
        }
        return output;
      },
      v2ResolveList({ ops, depth }) {
        const node: EntryV3ContentNode = {
          type: EntryV3ContentNodeType.bulletList,
          content: [],
        };
        const nodeContent: EntryV3ContentNode[] = [];
        let i = 0;
        while (i < ops.length) {
          const op = ops[i];
          if (op.attributes && typeof op.attributes.indent === 'number') {
            if (op.attributes.indent === depth) {
              nodeContent.push({
                type: EntryV3ContentNodeType.listItem,
                content: [
                  {
                    type: EntryV3ContentNodeType.paragraph,
                    content: [
                      {
                        type: EntryV3ContentNodeType.text,
                        marks: op.attributes
                          ? Migration.content.v2OpAttrsToMarks({
                              attrs: op.attributes,
                            })
                          : undefined,
                        text: op.insert.replace(/\n/g, ''),
                      },
                    ],
                  },
                ],
              });
              i++;
            } else if (op.attributes.indent > depth) {
              let subScopeTo = i;
              const newDepth = op.attributes.indent;
              let found = false;
              for (let j = i; j < ops.length; j++) {
                const subOp = ops[j];
                if (
                  subOp.attributes &&
                  subOp.attributes.indent &&
                  subOp.attributes.indent < newDepth
                ) {
                  subScopeTo = j;
                  found = true;
                  break;
                }
              }
              if (!found) {
                subScopeTo = ops.length;
              }
              const subListOps = ops.slice(i, subScopeTo);
              (
                nodeContent[nodeContent.length - 1]
                  .content as EntryV3ContentNode[]
              ).push(
                Migration.content.v2ResolveList({
                  ops: subListOps,
                  depth: newDepth,
                }),
              );
              if (subScopeTo === i) {
                i++;
              } else {
                i = subScopeTo;
              }
            } else {
              i++;
            }
          } else {
            i++;
          }
        }
        node.content = nodeContent;
        return node;
      },
      v2OpAttrsToMarks({ attrs }) {
        const marks: EntryV3ContentNodeMarker[] = [];
        if (attrs.bold) {
          marks.push({
            type: EntryV3ContentNodeMarkerType.bold,
          });
        }
        if (attrs.italic) {
          marks.push({
            type: EntryV3ContentNodeMarkerType.italic,
          });
        }
        if (attrs.underline) {
          marks.push({
            type: EntryV3ContentNodeMarkerType.underline,
          });
        }
        if (attrs.strike) {
          marks.push({
            type: EntryV3ContentNodeMarkerType.strike,
          });
        }
        if (attrs.link) {
          marks.push({
            type: EntryV3ContentNodeMarkerType.link,
            attrs: {
              href: attrs.link,
              target: '_blank',
            },
          });
        }
        return marks;
      },
      v2OpsToNode({ ops, nodeType }) {
        const node: EntryV3ContentNode = {
          type: nodeType,
          content: [],
        };
        const nodeContent: EntryV3ContentNode[] = [];
        let inList = false;
        let skipPush = false;
        const listOps: PropV2QuillOption[] = [];
        for (let i = 0; i < ops.length; i++) {
          const op = ops[i];
          const type: EntryV3ContentNodeType = EntryV3ContentNodeType.text;

          if (op.attributes) {
            if (op.attributes.list) {
              inList = true;
              if (ops[i + 2]) {
                const nextListItem = ops[i + 2];
                if (nextListItem.attributes && nextListItem.attributes.list) {
                  op.insert += ops[i - 1].insert;
                  op.attributes = op.attributes ? op.attributes : {};
                  if (ops[i - 1].attributes) {
                    op.attributes = {
                      ...op.attributes,
                      ...ops[i - 1].attributes,
                    };
                  }
                  if (!op.attributes.indent) {
                    op.attributes.indent = 0;
                  }
                  i++;
                }
                listOps.push(op);
              }
            }

            if (!inList && !skipPush) {
              nodeContent.push({
                type,
                text: op.insert,
                attrs:
                  nodeType === EntryV3ContentNodeType.codeBlock
                    ? {
                        language: null,
                      }
                    : undefined,
                marks: op.attributes
                  ? Migration.content.v2OpAttrsToMarks({ attrs: op.attributes })
                  : undefined,
              });
            } else if (skipPush) {
              skipPush = false;
            }
          } else {
            if (inList) {
              inList = false;
              skipPush = true;
              nodeContent.push(
                Migration.content.v2ResolveList({
                  ops: listOps,
                  depth: 0,
                }),
              );
            } else {
              nodeContent.push({
                type: EntryV3ContentNodeType.text,
                text: op.insert,
              });
            }
          }
        }
        node.content = nodeContent;
        return node;
      },
    };
  }
  static get transform(): {
    v2({
      args,
    }: {
      args: Args;
      migrationConfig: MigrationConfig;
    }): Promise<void>;
  } {
    return {
      async v2({ args, migrationConfig }) {
        const idc: { [name: string]: IdCounterV3 } = {
          groups: {
            _id: uuidv4(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            count: 1,
            forId: 'groups',
            name: 'Groups',
            __v: 0,
          },
          colors: {
            _id: uuidv4(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            count: 1,
            forId: 'colors',
            name: 'Colors',
            __v: 0,
          },
          entries: {
            _id: uuidv4(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            count: 1,
            forId: 'entries',
            name: 'Entires',
            __v: 0,
          },
          templates: {
            _id: uuidv4(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            count: 1,
            forId: 'templates',
            name: 'Templates',
            __v: 0,
          },
          orgs: {
            _id: uuidv4(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            count: 1,
            forId: 'orgs',
            name: 'Organizations',
            __v: 0,
          },
          tags: {
            _id: uuidv4(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            count: 1,
            forId: 'tags',
            name: 'Tags',
            __v: 0,
          },
          widgets: {
            _id: uuidv4(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            count: 1,
            forId: 'widgets',
            name: 'Widgets',
            __v: 0,
          },
        };
        const terminalListItems: {
          [name: string]: {
            name: string;
            maker: string;
          };
        } = {};
        for (let i = 0; i < Migration.collectionNames.v2.length; i++) {
          const item = Migration.collectionNames.v2[i];
          terminalListItems[item] = {
            name: item
              .split('_')
              .filter((e) => e)
              .map(
                (e) =>
                  e.substring(0, 1).toUpperCase() +
                  e.substring(1).toLocaleLowerCase(),
              )
              .join(' '),
            maker: '♺',
          };
        }
        // function updateTerminalList() {
        //   terminalList.update({
        //     state: {
        //       items: Object.keys(terminalListItems).map((name) => {
        //         const item = terminalListItems[name];
        //         return {
        //           text: item.name + ' ' + item.maker,
        //         };
        //       }),
        //     },
        //   });
        //   Terminal.render();
        // }
        function updateProgress(
          progressName: string,
          itemsLength: number,
          currentItem: number,
        ) {
          const progress = (100 / itemsLength) * (currentItem + 1);
          progressBar.update({
            state: {
              name: progressName,
              progress,
            },
          });
          Terminal.render();
        }
        const terminalList = createTerminalList({
          state: {
            items: Object.keys(terminalListItems).map((name) => {
              const item = terminalListItems[name];
              return {
                text: item.name + ' ' + item.maker,
              };
            }),
          },
        });
        const progressBar = createTerminalProgressBar({
          state: {
            name: 'Test',
            progress: 0,
          },
        });
        Terminal.pushComponent(
          {
            name: 'list',
            component: terminalList,
          },
          {
            name: 'progress',
            component: progressBar,
          },
        );
        const [fromPrfx, toPrfx] = Migration.getPrefix({
          args,
          migrationConfig,
        });
        const inputFs = createFS({
          base: path.join(Migration.basePath, 'v2_data'),
        });
        const outputFs = createFS({
          base: path.join(Migration.basePath, 'v3_data'),
        });
        for (let i = 0; i < Migration.collectionNames.v2.length; i++) {
          const cName = Migration.collectionNames.v2[i];
          let dbData = [];
          console.log(`${fromPrfx}${cName}.json`);
          if (await inputFs.exist(`${fromPrfx}${cName}.json`, true)) {
            try {
              dbData = JSON.parse(
                await inputFs.readString(`${fromPrfx}${cName}.json`),
              );
            } catch (error) {
              dbData = [];
            }
          }
          const progress = 0;
          const progressName = `[${i + 1}/${
            Migration.collectionNames.v2.length
          }] ${terminalListItems[cName].name}`;
          progressBar.update({
            state: {
              name: progressName,
              progress,
            },
          });
          Terminal.render();

          switch (cName) {
            case '_api_keys':
              {
                const items = dbData as ApiKeyV2[];
                const output: ApiKeyV3[] = [];
                for (let j = 0; j < items.length; j++) {
                  const item = items[j];
                  output.push({
                    _id: item._id.$oid,
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                    access: item.access,
                    blocked: item.blocked,
                    desc: item.desc,
                    name: item.name,
                    secret: item.secret,
                    userId: item.userId,
                    __v: 0,
                  });
                  updateProgress(progressName, items.length, j);
                }
                await outputFs.save(
                  `${toPrfx}${Migration.collectionNames.v2v3Map[cName]}.json`,
                  JSON.stringify(output, null, '  '),
                );
              }
              break;
            case '_languages':
              {
                const items = dbData as LanguageV2[];
                const output: LanguageV3[] = [];
                for (let j = 0; j < items.length; j++) {
                  const item = items[j];
                  output.push({
                    _id: item._id.$oid,
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                    code: item.code,
                    def: item.def,
                    name: item.name,
                    nativeName: item.nativeName,
                    userId: item.userId,
                    __v: 0,
                  });
                  updateProgress(progressName, items.length, j);
                }
                await outputFs.save(
                  `${toPrfx}${Migration.collectionNames.v2v3Map[cName]}.json`,
                  JSON.stringify(output, null, '  '),
                );
              }
              break;
            case '_medias':
              {
                const items = dbData as MediaV2[];
                const output: MediaV3[] = [];
                for (let j = 0; j < items.length; j++) {
                  const item = items[j];
                  output.push(
                    Migration.media.v2({ inputMedia: item, v2Media: items }),
                  );
                  updateProgress(progressName, items.length, j);
                }
                await outputFs.save(
                  `${toPrfx}${Migration.collectionNames.v2v3Map[cName]}.json`,
                  JSON.stringify(output, null, '  '),
                );
              }
              break;
            case '_groups':
              {
                const items = dbData as GroupV2[];
                const output: GroupV3[] = [];
                idc.groups.count = items.length;

                for (let j = 0; j < items.length; j++) {
                  const item = items[j];
                  output.push({
                    _id: item._id.$oid,
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                    cid: (j + 1).toString(16),
                    desc: item.desc,
                    label: item.label,
                    name: item.name,
                    props: Migration.props.v2({
                      inputProps: item.props,
                      v2Media: JSON.parse(
                        await inputFs.readString(`${fromPrfx}${cName}.json`),
                      ),
                    }),
                    __v: 0,
                  });
                }

                await outputFs.save(
                  `${toPrfx}${Migration.collectionNames.v2v3Map[cName]}.json`,
                  JSON.stringify(output, null, '  '),
                );
              }
              break;
            case '_templates':
              {
                const items = dbData as TemplateV2[];
                const output: TemplateV3[] = [];
                idc.templates.count = items.length;

                for (let j = 0; j < items.length; j++) {
                  const item = items[j];
                  output.push({
                    _id: item._id.$oid,
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                    cid: (j + 1).toString(16),
                    desc: item.desc,
                    label: item.label,
                    name: item.name,
                    singleEntry: false,
                    userId: item.userId,
                    props: Migration.props.v2({
                      inputProps: item.props,
                      v2Media: JSON.parse(
                        await inputFs.readString(`${fromPrfx}${cName}.json`),
                      ),
                    }),
                    __v: 0,
                  });
                }

                await outputFs.save(
                  `${toPrfx}${Migration.collectionNames.v2v3Map[cName]}.json`,
                  JSON.stringify(output, null, '  '),
                );
              }
              break;
            case '_widgets':
              {
                const items = dbData as WidgetV2[];
                const output: WidgetV3[] = [];
                idc.widgets.count = items.length;

                for (let j = 0; j < items.length; j++) {
                  const item = items[j];
                  output.push({
                    _id: item._id.$oid,
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                    cid: (j + 1).toString(16),
                    desc: item.desc,
                    label: item.label,
                    name: item.name,
                    // TODO: User image pointer
                    previewImage: item.previewImage,
                    previewScript: item.previewScript,
                    previewStyle: item.previewStyle,
                    props: Migration.props.v2({
                      inputProps: item.props,
                      v2Media: JSON.parse(
                        await inputFs.readString(`${fromPrfx}${cName}.json`),
                      ),
                    }),
                    __v: 0,
                  });
                }

                await outputFs.save(
                  `${toPrfx}${Migration.collectionNames.v2v3Map[cName]}.json`,
                  JSON.stringify(output, null, '  '),
                );
              }
              break;
            case '_entries':
              {
                const items = dbData as EntryV2[];
                const output: EntryV3[] = [];
                idc.entries.count = items.length;

                for (let j = 0; j < items.length; j++) {
                  const item = items[j];
                  const templates: TemplateV3[] = JSON.parse(
                    await outputFs.readString([`${toPrfx}_templates.json`]),
                  );
                  const template = templates.find(
                    (e) => e._id === item.templateId,
                  );
                  if (template) {
                    const newMeta: EntryV3Meta[] = [];
                    for (let k = 0; k < item.meta.length; k++) {
                      const meta = item.meta[k];
                      newMeta.push({
                        lng: meta.lng,
                        props: await Migration.props.v2Values({
                          inputProps: meta.props,
                          prfx: toPrfx,
                          schemaProps: template.props,
                        }),
                      });
                    }
                    const newContent: EntryV3Content[] = [];
                    for (let k = 0; k < item.content.length; k++) {
                      const content = item.content[k];
                      const nodes = await Migration.content.v2({
                        inputProps: content.props,
                        lng: content.lng,
                        prfx: toPrfx,
                      });
                      newContent.push({
                        lng: content.lng,
                        nodes,
                        plainText: nodes
                          .map((node) => nodeToText({ node }))
                          .join('\n'),
                      });
                    }
                    output.push({
                      _id: item._id.$oid,
                      createdAt: item.createdAt,
                      updatedAt: item.updatedAt,
                      cid: (j + 1).toString(16),
                      templateId: item.templateId,
                      userId: item.userId,
                      status: item.status,
                      meta: newMeta,
                      content: newContent,
                      __v: 0,
                    });
                  }
                  // updateProgress(progressName, items.length, j);
                }

                await outputFs.save(
                  `${toPrfx}${Migration.collectionNames.v2v3Map[cName]}.json`,
                  JSON.stringify(output, null, '  '),
                );
              }
              break;
          }
          terminalListItems[cName].maker = '✓';
          // updateTerminalList();
        }
        await outputFs.save(
          `${toPrfx}_id_counters.json`,
          JSON.stringify(
            Object.keys(idc).map((e) => e),
            null,
            '  ',
          ),
        );
      },
    };
  }
  static get pull(): {
    v2({
      args,
    }: {
      args: Args;
      migrationConfig: MigrationConfig;
    }): Promise<void>;
  } {
    return {
      async v2({ args, migrationConfig }) {
        const titleComponent = createTerminalTitle({
          state: {
            text: 'Migration V2 - Pulling data',
          },
        });
        Terminal.pushComponent({
          name: 'title',
          component: titleComponent,
        });
        const [prfx] = Migration.getPrefix({ args, migrationConfig });
        const url = args.dbUrl
          ? args.dbUrl
          : migrationConfig.database &&
            migrationConfig.database.from &&
            migrationConfig.database.from.url
          ? migrationConfig.database.from.url
          : '';
        if (!url) {
          throw Error(
            'Missing MongoDB database URL. Provide it in configuration' +
              ' file or in arguments.',
          );
        }
        const outputDir = 'v2_data';
        if (!(await Migration.fs.exist(outputDir))) {
          await Migration.fs.save([outputDir, 'tmp.txt'], ' ');
          await Migration.fs.deleteFile([outputDir, 'tmp.txt']);
        }
        /**
         * Check if mongoexport CLI is installed on the system
         */
        {
          const exo: ChildProcessOnChunkHelperOutput = {
            err: '',
            out: '',
          };
          await ChildProcess.advancedExec(['mongoexport', '--version'], {
            onChunk: ChildProcess.onChunkHelper(exo),
            doNotThrowError: true,
          }).awaiter;
          if (exo.err) {
            console.error(exo.err);
            throw Error(
              'It appears that "mongoexport" command is not installed on your system.',
            );
          }
        }
        for (let i = 0; i < Migration.collectionNames.v2.length; i++) {
          const cName = Migration.collectionNames.v2[i];
          await ChildProcess.spawn('mongoexport', [
            '--uri',
            url,
            '--collection',
            `${prfx}${cName}`,
            '--type',
            'json',
            '--out',
            path.join(Migration.basePath, outputDir, `${prfx}${cName}.json`),
            '--jsonArray',
            '--pretty',
          ]);
        }

        const pullMedia = (
          await prompt<{ yes: boolean }>([
            {
              name: 'yes',
              message: 'Would you like to pull CMS media?',
              type: 'confirm',
            },
          ])
        ).yes;

        if (pullMedia) {
          const cmsInfo = await getCmsInfo({ args, config: migrationConfig });
          const bcmsClient = BCMSClientV2({
            cmsOrigin: cmsInfo.origin,
            key: {
              id: cmsInfo.apiKey,
              secret: cmsInfo.apiSecret,
            },
          });
          titleComponent.update({
            state: {
              text: 'Migration V2 - Pull media',
            },
          });
          const progressBar = createTerminalProgressBar({
            state: {
              name: 'Pulling media',
              progress: 0,
            },
          });
          Terminal.pushComponent({
            name: 'progress',
            component: progressBar,
          });
          Terminal.render();
          const progressInterval = setInterval(() => {
            {
              progressBar.update({
                state: {
                  name: 'Pulling media',
                  progress: progressBar.state
                    ? progressBar.state.progress + 1
                    : 0,
                },
              });
              Terminal.render();
            }
          }, 500);
          const allMedia = (await bcmsClient.media.getAll()).filter(
            (e) => (e.data.type as string) !== MediaV2Type.DIR,
          );
          clearInterval(progressInterval);
          Terminal.removeComponent('progress');
          Terminal.render();
          const mediaFs = createFS({
            base: path.join(Migration.basePath, 'v2_data', 'uploads'),
          });
          for (let i = 0; i < allMedia.length; i++) {
            const media = allMedia[i];
            process.stdout.write(
              `[${i + 1}/${allMedia.length}] ` + media.data.name + ' ..... ',
            );
            try {
              const bin = await media.bin();
              await mediaFs.save(
                media.data.isInRoot
                  ? media.data.name
                  : [
                      ...media.data.path.split('/').filter((e) => e),
                      media.data.name,
                    ],
                bin as Buffer,
              );
              process.stdout.write('Done\n');
            } catch (error) {
              process.stdout.write('Fail\n\n');
              console.error(error);
              process.stdout.write('\n');
            }
          }
        }

        console.log('All collections pulled.');
      },
    };
  }
}
