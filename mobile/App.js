import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { BUNDLED_POOLS, BUNDLED_META } from './src/lib/data';

export default function App() {
  return (
    <View style={styles.container}>
      <Text>NYC Indoor Pool Finder</Text>
      <Text>
        {BUNDLED_POOLS.length} pools bundled (as of {BUNDLED_META.updated_at})
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
