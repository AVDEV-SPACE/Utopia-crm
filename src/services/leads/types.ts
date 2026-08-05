export type LeadStatus =
  | 'new'
  | 'scored'
  | 'pitch_ready'
  | 'sent'
  | 'replied'
  | 'negotiating'
  | 'won'
  | 'lost';

export type PitchChannel = 'email' | 'instagram' | 'whatsapp';

export interface ScoreDetails {
  https: boolean;
  has_ssl: boolean;
  mobile_friendly: boolean;
  page_speed_mobile: number | null;
  page_speed_desktop: number | null;
  last_updated_estimate: string | null;
  response_time_ms: number | null;
  reachable: boolean;
}

export interface Lead {
  id: string;
  company_name: string;
  website: string | null;
  niche: string | null;
  location: string | null;
  score: number | null;
  score_details: ScoreDetails | null;
  contact_email: string | null;
  contact_instagram: string | null;
  contact_phone: string | null;
  pitch_generated: string | null;
  pitch_subject: string | null;
  pitch_channel: PitchChannel;
  status: LeadStatus;
  payment_link: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewLeadInput {
  company_name: string;
  website: string | null;
  niche: string;
  location: string;
  score: number;
  score_details: ScoreDetails;
  contact_email?: string | null;
  contact_phone?: string | null;
}
