import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Classic (pre-2023) Twitter-style verified badge: a scalloped blue seal with a white check.
 * Shown next to plugins published by EasyServer itself.
 */
export function Verified({ size = 16 }: { size?: number }) {
  const lobes = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return { cx: 12 + Math.cos(a) * 6.3, cy: 12 + Math.sin(a) * 6.3 };
  });
  return (
    <View accessible accessibilityLabel="Made by EasyServer" accessibilityRole="image" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={8.4} fill="#1D9BF0" />
        {lobes.map((l, i) => (
          <Circle key={i} cx={l.cx} cy={l.cy} r={4.6} fill="#1D9BF0" />
        ))}
        <Path d="M7.6 12.4l2.9 2.9 5.9-6.2" fill="none" stroke="#FFFFFF" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
