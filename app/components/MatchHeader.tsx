'use client';

import Image from 'next/image';

export default function MatchHeader({ homeCrest, awayCrest }: { homeCrest: string; awayCrest: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
        borderRadius: 10,
        padding: '8px 10px',
        transition: 'all 0.3s ease',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.background = 'linear-gradient(90deg, rgba(255,0,255,0.10), rgba(0,255,255,0.10))';
        el.style.boxShadow = '0 6px 16px rgba(0,255,255,0.20)';
        el.style.transform = 'translateY(-1px)';
        el.style.border = '1px solid rgba(255,0,255,0.25)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.background = 'transparent';
        el.style.boxShadow = 'none';
        el.style.transform = 'none';
        el.style.border = '1px solid transparent';
      }}
    >
      <Image src={homeCrest} alt="home" width={28} height={28} style={{ objectFit: 'contain' }} />
      <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '0.02em' }}>vs</span>
      <Image src={awayCrest} alt="away" width={28} height={28} style={{ objectFit: 'contain' }} />
    </div>
  );
}
