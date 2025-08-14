import version00001 from './00001.md';

const version = process.env.release || '0';
const versionMap = {
  '0.0.1': version00001,
};

export const getUpdateContent = () => {
  return versionMap[version];
};

export { default as version0170 } from './0170.md';