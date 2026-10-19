import Detail from './screens/Detail';
import Lists from './screens/Lists';
import Settings from './screens/Settings';
import { useRoute } from './route';

export default function App() {
  const { path } = useRoute();
  const id = path.match(/^\/item\/(\d+)$/)?.[1];
  if (id) return <Detail id={Number(id)} />;
  if (path === '/add') return <main><p>Coming soon</p></main>;
  if (path === '/settings') return <Settings />;
  return <Lists tab={path === '/tickets' ? 'tickets' : 'cards'} />;
}
