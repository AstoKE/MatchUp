import { levelFromXp } from '@matchup/domain';
import { Text, View } from 'react-native';

// M1 scaffold screen: proves the workspace wiring (app → @matchup/domain). Replaced in M4.
export default function Index() {
  return (
    <View>
      <Text accessibilityRole="header">Foundation scaffold</Text>
      <Text>{`level(300 xp) = ${levelFromXp(300)}`}</Text>
    </View>
  );
}
