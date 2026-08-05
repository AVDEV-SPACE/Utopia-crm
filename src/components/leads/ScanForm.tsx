'use client';

import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface ScanFormProps {
  onScan: (niche: string, location: string, radiusKm: number) => Promise<void>;
  loading: boolean;
}

export function ScanForm({ onScan, loading }: ScanFormProps) {
  const [niche, setNiche] = useState('');
  const [location, setLocation] = useState('');
  const [radiusKm, setRadiusKm] = useState(10);

  const submit = async () => {
    if (loading || !niche.trim() || !location.trim()) return;
    await onScan(niche.trim(), location.trim(), radiusKm);
  };

  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-end gap-3 bg-stone-900/60 border border-stone-800/60 rounded-xl p-4">
      <div className="flex-1 w-full">
        <Label className="text-xs text-stone-500 mb-1.5 block">Nișă</Label>
        <Input
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          onKeyDown={handleEnter}
          placeholder="ex: dentist, restaurant, constructii"
        />
      </div>
      <div className="flex-1 w-full">
        <Label className="text-xs text-stone-500 mb-1.5 block">Locație</Label>
        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onKeyDown={handleEnter}
          placeholder="ex: Cluj-Napoca"
        />
      </div>
      <div className="w-full sm:w-32">
        <Label className="text-xs text-stone-500 mb-1.5 block">Rază (km)</Label>
        <Input
          type="number"
          min={1}
          max={100}
          value={radiusKm}
          onChange={(e) => setRadiusKm(Number(e.target.value))}
          onKeyDown={handleEnter}
        />
      </div>
      <Button type="button" onClick={submit} disabled={loading} className="w-full sm:w-auto">
        {loading ? <Loader2 className="animate-spin" /> : <Search />}
        {loading ? 'Scanează...' : 'Scanează lead-uri'}
      </Button>
    </div>
  );
}
