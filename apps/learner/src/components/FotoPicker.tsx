import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Button } from './ui';

export type PickedAsset = {
  uri: string;
  name: string;
  mimeType: string;
};

type FotoPickerProps = {
  onPick: (asset: PickedAsset) => void;
  onError: (message: string) => void;
  disabled?: boolean;
};

export function FotoPicker({ onPick, onError, disabled }: FotoPickerProps) {
  if (Platform.OS === 'web') {
    return null;
  }

  async function processAsset(asset: ImagePicker.ImagePickerAsset) {
    try {
      const actions: ImageManipulator.Action[] = [];
      const width = asset.width ?? 0;
      const height = asset.height ?? 0;
      if (width > 2000 || height > 2000) {
        if (width >= height) {
          actions.push({ resize: { width: 2000 } });
        } else {
          actions.push({ resize: { height: 2000 } });
        }
      }
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        actions,
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );
      onPick({
        uri: manipulated.uri,
        name: `foto-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Errore durante elaborazione della foto.');
    }
  }

  async function takePhoto() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        onError('Permesso fotocamera non concesso.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled && result.assets?.[0]) {
        await processAsset(result.assets[0]);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Impossibile avviare la fotocamera.');
    }
  }

  async function pickPhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        onError('Permesso galleria non concesso.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled && result.assets?.[0]) {
        await processAsset(result.assets[0]);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Impossibile aprire la galleria.');
    }
  }

  return (
    <View style={styles.row}>
      <Button
        label="Scatta una foto"
        onPress={takePhoto}
        disabled={disabled}
        secondary
      />
      <Button
        label="Scegli dalla galleria"
        onPress={pickPhoto}
        disabled={disabled}
        secondary
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
});
