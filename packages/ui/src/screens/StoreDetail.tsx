import React from 'react';
import { View } from 'react-native';
import { CATEGORIES, isOnline } from '@easyserver/core';
import { Page } from '../components/Page';
import { Button, Card, Empty, Row, SectionHeader, T } from '../components/primitives';
import { PluginIcon } from '../components/PluginIcon';
import { useCatalog } from '../catalog';
import { backend, navigate, selectedServer, useApp } from '../state';
import { openUrl, platformName } from '../platform';
import { GetButton } from './Discover';

/** Mac App Store–style product page: icon, name over developer, GET on the right, description below. */
export function StoreDetailScreen({ sourceUrl }: { sourceUrl: string }) {
  const cat = useCatalog();
  const item = cat.items.find((i) => i.sourceUrl === sourceUrl);
  const server = useApp(selectedServer);
  const mode = backend().mode;
  const back = () => navigate('discover');

  if (!item) {
    return (
      <Page onBack={back}>
        <Empty title="Plugin Not Found" body="It may have been removed from the store." />
      </Page>
    );
  }
  const m = item.manifest;
  const supported = server?.platform ? m.platforms.includes(server.platform as any) : true;
  const hint = !server
    ? 'Add a server to install plugins.'
    : mode === 'client' && !isOnline(server)
      ? `${server.name} is offline.`
      : !supported
        ? `Not available for ${platformName(server.platform)}.`
        : null;

  return (
    <Page onBack={back} maxWidth={900}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 22, paddingTop: 16, paddingBottom: 26, flexWrap: 'wrap' }}>
        <PluginIcon uri={item.iconUrl} name={m.name} id={m.id} size={128} />
        <View style={{ flex: 1, minWidth: 200 }}>
          <T v="title1" accessibilityRole="header">
            {m.name}
          </T>
          <T v="body" color="secondary" style={{ marginTop: 2 }}>
            {m.developer}
          </T>
          {m.subtitle ? (
            <T v="callout" color="secondary" style={{ marginTop: 8 }}>
              {m.subtitle}
            </T>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          {supported ? <GetButton item={item} large /> : null}
          {hint ? (
            <T v="caption" color="secondary" style={{ maxWidth: 180, textAlign: 'right' }}>
              {hint}
            </T>
          ) : null}
        </View>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: 'transparent', marginBottom: 28 }}>
        {m.description.split(/\n\s*\n/).map((para, i) => (
          <T key={i} style={{ fontSize: 14, lineHeight: 21, marginBottom: 12, maxWidth: 680 }}>
            {para.trim()}
          </T>
        ))}
      </View>

      <SectionHeader title="Information" />
      <Card style={{ paddingVertical: 4 }}>
        <Row label="Developer" value={m.developer} />
        <Row label="Category" value={CATEGORIES[m.category]} />
        <Row label="Version" value={m.version} />
        <Row label="Works On" value={m.platforms.map(platformName).join(', ')} />
        <Row label="Settings" value={m.settings?.length ? `${m.settings.length} options` : 'None'} />
        <Row label="Source" last>
          <Button kind="plain" small title="View on GitHub" onPress={() => openUrl(item.sourceUrl)} />
        </Row>
      </Card>
    </Page>
  );
}
