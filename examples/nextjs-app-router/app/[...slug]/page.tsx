import { notFound } from 'next/navigation';
import { AuroraPage } from '../components/AuroraPage';
import { demoPages } from '../../lib/provider';

/** Every public provider URL has a matching server-rendered human page. */
export default async function ContentPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const path = '/' + (slug ?? []).join('/');
  const page = demoPages.find((item) => item.path === path);
  if (!page) notFound();

  return <AuroraPage page={page} />;
}
