import { use } from 'react';
import TeamClient from './TeamClient';

export default function Page({ params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = use(params);
  return <TeamClient entryId={entryId} />;
}
