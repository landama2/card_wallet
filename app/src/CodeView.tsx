import { Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import bwipjs from 'bwip-js/dist/bwip-js.mjs';
import { BCID, Format } from './logic';

export default function CodeView({ code, format }: { code: string; format: Format }) {
  let xml: string;
  try {
    xml = bwipjs.toSVG({
      bcid: BCID[format], text: code, scale: 4, backgroundcolor: 'FFFFFF',
      paddingwidth: 10, paddingheight: 10,
    });
  } catch (e) {
    return <Text>Cannot render this code: {String(e)}</Text>;
  }
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center' }}>
      <SvgXml xml={xml} width="100%" height="100%" />
    </View>
  );
}
