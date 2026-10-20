import Add from './screens/Add';
import Detail from './screens/Detail';
import Lists from './screens/Lists';
import Settings from './screens/Settings';
import { KINDS, type Kind } from './logic';
import { useRoute } from './route';

export default function App() {
  const { path, params } = useRoute();
  const id = path.match(/^\/item\/(\d+)$/)?.[1];
  if (id) return <Detail id={Number(id)} till={params.get('till') === '1'} />;
  const editId = path.match(/^\/edit\/(\d+)$/)?.[1];
  if (editId) return <Add key={path} kind="card" shared={false} editId={Number(editId)} scanning={params.get('scan') === '1'} />;
  if (path === '/add') {
    const kind = (KINDS as readonly string[]).includes(params.get('kind') ?? '') ? (params.get('kind') as Kind) : 'card';
    return <Add key={path + kind} kind={kind} shared={params.get('shared') === '1'} scanning={params.get('scan') === '1'} />;
  }
  if (path === '/settings') return <Settings />;
  return <Lists tab={KINDS.find((k) => path === `/${k}s`) ?? 'card'} />;
}
