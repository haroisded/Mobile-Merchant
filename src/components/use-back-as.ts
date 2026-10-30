import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

/**
 * Back — Android's button, the iOS swipe — doing `action` instead of popping the page: Return to Register after a
 * sale, Cancel on a refund's preview (src/screens/pos-orders/), the store's fields on Create Store's level step.
 * Null leaves Back as it is.
 */
export function useBackAs(action: (() => void) | null) {
  const navigation = useNavigation();

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ gestureEnabled: action === null });
      if (!action) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        action();
        return true;
      });
      return () => subscription.remove();
    }, [navigation, action])
  );
}
