CREATE DATABASE IF NOT EXISTS db_aurora;
USE db_aurora;

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NULL,
    google_id VARCHAR(255) NULL UNIQUE,
    avatar_url VARCHAR(512) NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'USER',
    subscription_tier VARCHAR(50) NOT NULL DEFAULT 'free',
    stripe_customer_id VARCHAR(255) NULL,
    stripe_subscription_id VARCHAR(255) NULL,
    subscription_status VARCHAR(50) NOT NULL DEFAULT 'active',
    subscription_period_end TIMESTAMP NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    two_factor_secret VARCHAR(255) NULL,
    two_factor_recovery_codes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    username_changed_at TIMESTAMP NULL,
    email_changed_at TIMESTAMP NULL,
    INDEX idx_users_stripe_cust (stripe_customer_id),
    INDEX idx_users_stripe_sub (stripe_subscription_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id VARCHAR(36) PRIMARY KEY,
    theme VARCHAR(20) NOT NULL DEFAULT 'system',
    language VARCHAR(50) NOT NULL DEFAULT 'es-MX',
    open_links_new_tab BOOLEAN NOT NULL DEFAULT TRUE,
    telemetry BOOLEAN NOT NULL DEFAULT FALSE,
    reduce_motion BOOLEAN NOT NULL DEFAULT FALSE,
    high_contrast BOOLEAN NOT NULL DEFAULT FALSE,
    extended_alerts BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id VARCHAR(50) NOT NULL,
    permission_id VARCHAR(100) NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO roles (id, name, description) VALUES
('ADMIN', 'Administrador', 'Acceso administrativo total'),
('USER', 'Usuario Estándar', 'Usuario con acceso a herramientas y gestión de perfil'),
('SYSTEM_ACCOUNT', 'Cuenta del Sistema', 'Cuenta protegida del sistema con edición restringida'),
('ORG_OWNER', 'Propietario de Organización', 'Control administrativo total de la organización, facturación y SSO'),
('ORG_ADMIN', 'Administrador de Organización', 'Gestión de miembros y herramientas de la organización'),
('ORG_MEMBER', 'Miembro de Organización', 'Miembro con acceso a herramientas de la organización');

INSERT IGNORE INTO permissions (id, name, description) VALUES
('*', 'Acceso Total', 'Permiso comodín de administración'),
('account:view_profile', 'Ver Perfil', 'Ver información de perfil'),
('account:edit_identifiers', 'Editar Identificadores', 'Modificar nombre de usuario o correo'),
('account:edit_security', 'Editar Seguridad', 'Modificar contraseña y 2FA'),
('account:delete', 'Eliminar Cuenta', 'Eliminar permanentemente la cuenta'),
('workflows:manage', 'Gestionar Flujos de Trabajo', 'Crear y ejecutar flujos de trabajo automatizados'),
('org:manage', 'Gestionar Organización', 'Administrar detalles de la organización y dominios'),
('org:members:invite', 'Invitar Miembros', 'Invitar y añadir usuarios a la organización'),
('org:members:remove', 'Remover Miembros', 'Eliminar miembros de la organización'),
('org:sso:configure', 'Configurar SSO', 'Configurar proveedores de SSO corporativo'),
('subscription:feature:sso', 'Función SSO Corporativo', 'Acceso a inicio de sesión único empresarial'),
('subscription:feature:teams', 'Función Espacios de Equipo', 'Acceso a gestión de equipos y límites de asientos');

INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES
('ADMIN', '*'),
('USER', 'account:view_profile'),
('USER', 'account:edit_identifiers'),
('USER', 'account:edit_security'),
('USER', 'account:delete'),
('USER', 'workflows:manage'),
('SYSTEM_ACCOUNT', 'account:view_profile'),
('SYSTEM_ACCOUNT', 'workflows:manage'),
('ORG_OWNER', 'org:manage'),
('ORG_OWNER', 'org:members:invite'),
('ORG_OWNER', 'org:members:remove'),
('ORG_OWNER', 'org:sso:configure'),
('ORG_OWNER', 'subscription:feature:sso'),
('ORG_OWNER', 'subscription:feature:teams'),
('ORG_OWNER', 'account:view_profile'),
('ORG_OWNER', 'workflows:manage'),
('ORG_ADMIN', 'org:members:invite'),
('ORG_ADMIN', 'org:members:remove'),
('ORG_ADMIN', 'subscription:feature:teams'),
('ORG_ADMIN', 'account:view_profile'),
('ORG_ADMIN', 'workflows:manage'),
('ORG_MEMBER', 'subscription:feature:teams'),
('ORG_MEMBER', 'account:view_profile'),
('ORG_MEMBER', 'workflows:manage');

INSERT IGNORE INTO users (id, username, email, password_hash, google_id, role, two_factor_enabled, created_at, updated_at) VALUES
('50e0819a-7151-433c-8797-613f6cbf0b6a', 'aurora_admin', 'admin@example.com', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', NULL, 'ADMIN', 0, '2026-10-12 17:48:30', '2026-10-12 19:35:41'),
('b1fe03d3-94af-4572-8184-d72ecd6e257d', 'aurora_user', 'user@example.com', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', NULL, 'USER', 0, '2026-10-12 18:03:09', '2026-10-13 15:33:39');

INSERT IGNORE INTO user_preferences (user_id, theme, language, open_links_new_tab, telemetry, reduce_motion, high_contrast, extended_alerts) VALUES
('50e0819a-7151-433c-8797-613f6cbf0b6a', 'system', 'es-MX', 1, 0, 0, 0, 0),
('b1fe03d3-94af-4572-8184-d72ecd6e257d', 'system', 'es-MX', 1, 0, 0, 0, 0);

CREATE TABLE IF NOT EXISTS purchases (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    stripe_session_id VARCHAR(255) NOT NULL UNIQUE,
    stripe_payment_intent_id VARCHAR(255) NULL,
    stripe_subscription_id VARCHAR(255) NULL,
    stripe_customer_id VARCHAR(255) NULL,
    plan_id VARCHAR(50) NOT NULL,
    billing_period ENUM('monthly', 'yearly') NOT NULL DEFAULT 'monthly',
    amount_total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_purchases_user (user_id),
    INDEX idx_purchases_sub (stripe_subscription_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_workflows (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description VARCHAR(255) NULL,
    category ENUM('pdf', 'image') NOT NULL DEFAULT 'pdf',
    steps JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_workflows_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS enterprise_inquiries (
    id VARCHAR(36) PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    company VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status ENUM('pending', 'contacted', 'closed') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_enterprise_inquiries_email (email),
    INDEX idx_enterprise_inquiries_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS organizations (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    owner_id VARCHAR(36) NOT NULL,
    seat_limit INT NOT NULL DEFAULT 5,
    subscription_status ENUM('active', 'trial', 'past_due', 'suspended') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_organizations_owner (owner_id),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS organization_members (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'ORG_MEMBER',
    status ENUM('active', 'invited', 'suspended') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_org_user (organization_id, user_id),
    INDEX idx_org_members_user (user_id),
    INDEX idx_org_members_org (organization_id),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS organization_domains (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL,
    domain VARCHAR(255) NOT NULL UNIQUE,
    is_verified BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_org_domains_domain (domain),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS organization_sso_configs (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL UNIQUE,
    provider ENUM('google', 'azure', 'saml') NOT NULL DEFAULT 'google',
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    enforce_sso BOOLEAN NOT NULL DEFAULT FALSE,
    client_id VARCHAR(512) NULL,
    client_secret VARCHAR(512) NULL,
    tenant_id VARCHAR(255) NULL,
    saml_entrypoint VARCHAR(1024) NULL,
    saml_issuer VARCHAR(512) NULL,
    saml_cert TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



