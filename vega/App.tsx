/**
 * Milo — REFERENCE Vega OS host shell.
 *
 * Not needed if you generated MiloVega from the vegaWebview template: that
 * template's App.tsx already loads file:///pkg/assets/index.html and is the
 * real host. The only thing here the template lacks is the optional `onMessage`
 * exit handler (Milo posts {type:'exit'} when Back is pressed twice on Home).
 *
 * Verified against Amazon's "Develop your app with WebView" docs:
 *  - package `@amazon-devices/webview`, `WebView` component
 *  - bundled assets load from `file:///pkg/assets/...`
 *  - D-pad arrives as ArrowUp/Down/Left/Right + Enter (no extra setup)
 *  - `allowSystemKeyEvents` delivers Back to the page as keyCode 27
 *  - page -> app messages via `window.ReactNativeWebView.postMessage(string)`
 *
 * UNVERIFIED (check on the Vega Virtual Device / Fire TV):
 *  - `BackHandler.exitApp()` from 'react-native' on Vega. If unavailable, the
 *    Back-on-home flow simply shows Milo waving goodbye and the system handles exit.
 *  - Web Audio inside the Vega WebView. If missing, Milo runs in visual-only mode.
 *
 * Keep the starter's own export style (default vs named) if it differs.
 */
import React from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { WebView } from '@amazon-devices/webview';

const MILO_URI = 'file:///pkg/assets/index.html';

export const App = () => {
  const onMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg?.type === 'exit') BackHandler?.exitApp?.();
    } catch {
      // Ignore anything that is not one of our own small JSON messages.
    }
  };

  return (
    <View style={styles.root}>
      <WebView
        source={{ uri: MILO_URI }}
        hasTVPreferredFocus={true}
        javaScriptEnabled={true}
        allowSystemKeyEvents={true}
        onMessage={onMessage}
        style={styles.web}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#6EC6F2' },
  // Background colour avoids the default white flash before the page paints.
  web: { flex: 1, backgroundColor: '#6EC6F2' },
});

export default App;
