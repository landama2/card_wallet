import bwipjs from 'bwip-js/browser';
import { renderOptions, type Format } from './logic';

export default function CodeView({ code, format }: { code: string; format: Format }) {
  let svg: string;
  try {
    svg = bwipjs.toSVG(renderOptions(code, format));
  } catch (e) {
    return <p>Cannot render this code: {String(e)}</p>;
  }
  // bwip-js output contains only drawing paths (no human-readable text), so injecting it is safe.
  return <div className="code" dangerouslySetInnerHTML={{ __html: svg }} />;
}
