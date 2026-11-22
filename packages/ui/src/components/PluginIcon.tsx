import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { fonts, radius } from '../theme';

const tints = [
  ['#5E5CE6', '#3634A3'],
  ['#30B0C7', '#1C7C8C'],
  ['#34C759', '#248A3D'],
  ['#FF9F0A', '#C93400'],
  ['#FF375F', '#C80F3C'],
  ['#64D2FF', '#0071A4'],
  ['#BF5AF2', '#8944AB'],
  ['#8E8E93', '#48484A'],
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** App-icon shaped tile (continuous-ish corners at 22.5%), with a lettered fallback. */
export function PluginIcon({ uri, name, id, size = 64 }: { uri?: string | null; name: string; id: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const r = size * radius.icon;
  if (uri && !failed) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        accessible={false}
        source={{ uri }}
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: r }}
      />
    );
  }
  const [a, b] = tints[hash(id) % tints.length];
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: r,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage: `linear-gradient(180deg, ${a}, ${b})`,
        backgroundColor: b,
      } as any}
    >
      <Text style={{ color: '#fff', fontSize: size * 0.44, fontWeight: '700', fontFamily: fonts.display }}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}
