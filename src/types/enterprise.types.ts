export interface Organization {
  created_at: string;
  id: string;
  name: string;
  owner_id: string;
  seat_limit: number;
  slug: string;
  subscription_status: 'active' | 'trial' | 'past_due' | 'suspended';
  updated_at: string;
}

export interface OrganizationMember {
  created_at: string;
  email?: string;
  id: string;
  organization_id: string;
  role: string;
  status: 'active' | 'invited' | 'suspended';
  updated_at: string;
  user_id: string;
  username?: string;
}

export interface OrganizationDomain {
  created_at: string;
  domain: string;
  id: string;
  is_verified: boolean;
  organization_id: string;
}

export interface OrganizationSsoConfig {
  client_id: string | null;
  client_secret: string | null;
  created_at: string;
  enforce_sso: boolean;
  id: string;
  is_enabled: boolean;
  organization_id: string;
  provider: 'google' | 'azure' | 'saml';
  saml_cert: string | null;
  saml_entrypoint: string | null;
  saml_issuer: string | null;
  tenant_id: string | null;
  updated_at: string;
}

export interface CreateOrganizationDto {
  domain?: string;
  name: string;
  ownerId: string;
  seatLimit?: number;
  slug?: string;
}

export interface AddMemberDto {
  email: string;
  organizationId: string;
  role?: string;
}

export interface ConfigureSsoDto {
  clientId?: string;
  clientSecret?: string;
  enforceSso?: boolean;
  isEnabled?: boolean;
  organizationId: string;
  provider: 'google' | 'azure' | 'saml';
  samlCert?: string;
  samlEntrypoint?: string;
  samlIssuer?: string;
  tenantId?: string;
}

export interface SsoLookupResult {
  enforceSso: boolean;
  hasSso: boolean;
  organizationId: string;
  organizationName: string;
  provider: 'google' | 'azure' | 'saml';
}
