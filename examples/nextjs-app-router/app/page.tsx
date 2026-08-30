import { AuroraPage } from './components/AuroraPage';
import { demoPages } from '../lib/provider';

export default function Home() {
  const page = demoPages.find((item) => item.path === '/');
  if (!page) return null;
  return <AuroraPage page={page} />;
}
