import Add from './screens/Add';
import Detail from './screens/Detail';
import Lists from './screens/Lists';
import Settings from './screens/Settings';
import { KINDS, type Kind } from './logic';
import { useRoute } from './route';

export default function App() {
  const { path, params } = useRoute();
  const id = path.match(/^\/item\/(\d+)$/)?.[1];
  if (id) return <Detail id={Number(id)} />;
  if (path === '/add') {
    const kind = (KINDS as readonly string[]).includes(params.get('kind') ?? '') ? (params.get('kind') as Kind) : 'card';
    return <Add kind={kind} shared={params.get('shared') === '1'} />;
  }
  if (path === '/settings') return <Settings />;
  return <Lists tab={KINDS.find((k) => path === `/${k}s`) ?? 'card'} />;
}
