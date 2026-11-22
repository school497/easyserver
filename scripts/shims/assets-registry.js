// react-native-svg imports React Native's asset registry; on web there are no bundled RN assets.
const assets = [];
export function registerAsset(asset) { return assets.push(asset); }
export function getAssetByID(id) { return assets[id - 1]; }
