import React from 'react';
import { View } from 'react-native';
import { CATEGORIES, isOnline } from '@easyserver/core';
import { Page } from '../components/Page';
import { Button, Card, Empty, Row, SectionHeader, T } from '../components/primitives';
import { PluginIcon } from '../components/PluginIcon';
import { isOfficial, useCatalog } from '../catalog';
import { Verified } from '../components/Verified';
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
  const official = isOfficial(item.sourceUrl, m.developer);
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <T v="body" color="secondary">
              {m.developer}
            </T>
            {official ? <Verified size={15} /> : null}
          </View>
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
        <Row
          label="Developer"
          value={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <T color="secondary">{m.developer}</T>
              {official ? <Verified size={15} /> : null}
            </View>
          }
        />
        <Row label="Category" value={CATEGORIES[m.category]} />
        <Row label="Version" value={m.version} />
        <Row label="Works On" value={m.platforms.map(platformName).join(', ')} />
        <Row label="Settings" value={m.settings?.length ? `${m.settings.length} options` : 'None'} last />
      </Card>
    </Page>
  );
}
