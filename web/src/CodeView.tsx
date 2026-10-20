import bwipjs from 'bwip-js/browser';
import { FORMAT_LABEL, renderOptions, type Format } from './logic';

// `editHref`: where to fix the code type when it can't be drawn (the number itself is shown by the caller).
export default function CodeView({ code, format, editHref }: { code: string; format: Format; editHref?: string }) {
  let svg: string;
  try {
    svg = bwipjs.toSVG(renderOptions(code, format));
  } catch {
    return (
      <p className="code-error">
        {/* stopPropagation: the code card around this opens till mode on click. */}
        This code can't be drawn as {FORMAT_LABEL[format]}.{editHref && <> <a href={editHref} onClick={(e) => e.stopPropagation()}>Change the code type</a></>}
      </p>
    );
  }
  // bwip-js output contains only drawing paths (no human-readable text), so injecting it is safe.
  return <div className="code" dangerouslySetInnerHTML={{ __html: svg }} />;
}
