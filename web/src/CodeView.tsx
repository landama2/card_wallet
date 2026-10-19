import bwipjs from 'bwip-js/browser';
import { BCID, type Format } from './logic';

export default function CodeView({ code, format }: { code: string; format: Format }) {
  let svg: string;
  try {
    svg = bwipjs.toSVG({ bcid: BCID[format], text: code, scale: 4, paddingwidth: 10, paddingheight: 10, backgroundcolor: 'FFFFFF' });
  } catch (e) {
    return <p>Cannot render this code: {String(e)}</p>;
  }
  // bwip-js output contains only drawing paths (no human-readable text), so injecting it is safe.
  return <div className="code" dangerouslySetInnerHTML={{ __html: svg }} />;
}
