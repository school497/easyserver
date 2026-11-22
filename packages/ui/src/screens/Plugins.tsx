import { showFocusRing } from '../platform';
import React from 'react';
import { Pressable, View } from 'react-native';
import { Page, Target } from '../components/Page';
import { Button, Card, Empty, StatusLabel, T, statusInfo } from '../components/primitives';
import { PluginIcon } from '../components/PluginIcon';
import { navigate, selectedServer, store, useApp } from '../state';
import { useTheme } from '../theme';
import { iconFor } from './Home';
import { isOfficial } from '../catalog';
import { Verified } from '../components/Verified';

export function PluginsScreen() {
  const { c } = useTheme();
  const plugins = useApp((s) => s.plugins);
  const server = useApp(selectedServer);

  if (!server) {
    return (
      <Page title="Plugins">
        <Empty title="No Server Selected" body="Add a server to install and manage plugins." action={<Button kind="primary" title="Add Server…" onPress={() => store.set({ addServerOpen: true })} />} />
      </Page>
    );
  }

  return (
    <Page title="Plugins" subtitle={plugins.length ? `${plugins.filter((p) => p.status === 'running').length} running on ${server.name}` : undefined}>
      {plugins.length === 0 ? (
        <Empty title="No Plugins" body="Get a plugin from Discover to start serving." action={<Button kind="primary" title="Browse Discover" onPress={() => navigate('discover')} />} />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          {plugins.map((p) => {
            const st = statusInfo(p.status);
            return (
              <Target key={p.plugin_id} id={`plugin.${p.plugin_id}`} style={{ flexGrow: 1, flexBasis: 200, maxWidth: 280, minWidth: 180 }}>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`${p.name}, ${st.label}`}
                  onPress={() => navigate('plugins', { kind: 'plugin', pluginId: p.plugin_id })}
                  style={(s: any) => [
                    { borderRadius: 14 },
                    showFocusRing(s.focused) && ({ outlineColor: c.accent, outlineWidth: 2, outlineStyle: 'solid' } as any),
                    s.hovered && { transform: [{ translateY: -1 }] },
                  ]}
                >
                  {({ hovered }: any) => (
                    <Card style={[{ alignItems: 'center', paddingVertical: 22 }, hovered && ({ boxShadow: `0 6px 20px ${c.shadow}` } as any)]}>
                      <PluginIcon id={p.plugin_id} name={p.name} uri={iconFor(p)} size={72} />
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12, marginBottom: 4, maxWidth: '100%' }}>
                        <T v="headline" numberOfLines={1} style={{ textAlign: 'center', flexShrink: 1 }}>
                          {p.name}
                        </T>
                      </View>
                      <StatusLabel status={st.tone} label={st.label} />
                    </Card>
                  )}
                </Pressable>
              </Target>
            );
          })}
        </View>
      )}
    </Page>
  );
}
