import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback } from 'react';
import { Dimensions, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { brandColors, gray } from '../../../design-system/tokens/colors';
import { radii } from '../../../design-system/tokens/radii';
import { space } from '../../../design-system/tokens/spacing';
import { fontFamily } from '../../../design-system/tokens/typography';
import { zIndex } from '../../../design-system/tokens/zIndex';
import type { SelectedPoiState } from '../types';
import { MAKI_TO_TYPE } from '../constants';

type PoiCardProps = {
  selectedPoi: NonNullable<SelectedPoiState>;
  onDismiss: () => void;
};

export const PoiCard = React.memo(({ selectedPoi, onDismiss }: PoiCardProps) => {
  const screenW = Dimensions.get('window').width;
  const screenH = Dimensions.get('window').height;
  const cardW = screenW * 0.44;
  const cardH = 60;
  const toRight = selectedPoi.screenX < screenW * 0.55;
  const cardLeft = toRight
    ? Math.min(selectedPoi.screenX + 16, screenW - cardW - 8)
    : Math.max(selectedPoi.screenX - cardW - 16, 8);
  const cardTop = Math.max(8, Math.min(selectedPoi.screenY - cardH / 2, screenH - cardH - 8));

  const handleWebsite = useCallback(() => {
    if (selectedPoi.website) {
      void Linking.openURL(selectedPoi.website);
    }
  }, [selectedPoi.website]);

  return (
    <Pressable
      style={[styles.poiCard, { left: cardLeft, top: cardTop, width: cardW }]}
      onPress={onDismiss}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${selectedPoi.type}: ${selectedPoi.name}. Tap to dismiss.`}
    >
      <View style={styles.poiCardContent}>
        <View style={styles.poiCardHeader}>
          <Text style={styles.poiCardType}>{selectedPoi.type}</Text>
          <Pressable
            onPress={onDismiss}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={12} color={gray[400]} />
          </Pressable>
        </View>
        <Text style={styles.poiCardName} numberOfLines={1}>{selectedPoi.name}</Text>
        {selectedPoi.website ? (
          <Pressable
            onPress={handleWebsite}
            accessibilityRole="link"
            accessibilityLabel={`Open website for ${selectedPoi.name}`}
          >
            <Text style={styles.poiCardLink}>website ↗</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
});

PoiCard.displayName = 'PoiCard';

/** Hook to create POI press handler for VectorSource / ShapeSource onPress */
export const usePoiCardHandler = (
  mapViewRef: React.RefObject<any>,
  selectedPoi: SelectedPoiState,
  setSelectedPoi: (poi: SelectedPoiState) => void,
) => {
  const handlePoiPress = useCallback(async (event: any) => {
    try {
      const feature = event?.features?.[0];
      if (!feature) return;
      const props = feature.properties ?? {};
      const coords = feature.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return;

      const name = props.name ?? 'Unknown';

      if (selectedPoi && selectedPoi.name === name) {
        setSelectedPoi(null);
        return;
      }

      let screenX = 200;
      let screenY = 300;
      try {
        const mapRef = mapViewRef.current;
        if (mapRef) {
          const point = await (mapRef as any).getPointInView([coords[0], coords[1]]);
          if (Array.isArray(point) && point.length >= 2) {
            screenX = point[0];
            screenY = point[1];
          }
        }
      } catch {
        // fallback to defaults
      }

      setSelectedPoi({
        name,
        type: MAKI_TO_TYPE[props.maki] ?? props.type ?? 'Point of Interest',
        website: props.website_url || undefined,
        screenX,
        screenY,
      });
    } catch {
      // ignore
    }
  }, [mapViewRef, selectedPoi, setSelectedPoi]);

  return handlePoiPress;
};

const styles = StyleSheet.create({
  poiCard: {
    position: 'absolute',
    zIndex: zIndex.popover,
  },
  poiCardContent: {
    backgroundColor: 'rgba(11, 16, 32, 0.93)',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    paddingHorizontal: space[2] + space[0.5],
    paddingVertical: space[2],
    gap: 2,
  },
  poiCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  poiCardType: {
    fontSize: 8,
    fontFamily: fontFamily.heading.bold,
    color: '#D4A843',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  poiCardName: {
    fontSize: 11,
    fontFamily: fontFamily.body.medium,
    color: brandColors.textPrimary,
  },
  poiCardLink: {
    fontSize: 10,
    color: '#4A9EAF',
    fontFamily: fontFamily.body.medium,
  },
});
