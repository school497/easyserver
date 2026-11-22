import React from 'react';
import { AppRegistry } from 'react-native';
import { App } from './App';

/** Mounts the shared React Native UI into #root (react-native-web inside Electron). */
export function mount(mode: 'client' | 'server') {
  const Root = () => React.createElement(App, { mode });
  AppRegistry.registerComponent('EasyServer', () => Root);
  AppRegistry.runApplication('EasyServer', { rootTag: document.getElementById('root') });
}

export { App };
