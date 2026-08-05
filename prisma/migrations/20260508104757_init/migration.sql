-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "company_name" TEXT,
    "meeting_date" TEXT NOT NULL,
    "meeting_time" TEXT NOT NULL,
    "meeting_topic" TEXT,
    "service_desired" TEXT,
    "existing_website" TEXT,
    "website_url" TEXT,
    "website_purpose" TEXT,
    "target_audience" TEXT,
    "desired_features" TEXT[],
    "competitors_reference" TEXT,
    "desired_result" TEXT,
    "budget_range" TEXT,
    "timeline" TEXT,
    "additional_notes" TEXT,
    "meet_link" TEXT,
    "calendar_event_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "company_name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'website',
    "status" TEXT NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "service_type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "total_amount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "line_items" JSONB,
    "tools_used" TEXT[],
    "desired_outcomes" TEXT[],
    "timeline" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contact_id" TEXT,
    "quote_id" TEXT,
    "description" TEXT,
    "details" TEXT,
    "user_id" TEXT,
    "duration_minutes" INTEGER,
    "outcome" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "sessionId" TEXT NOT NULL,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "firstMessage" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "bookedConsultation" BOOLEAN NOT NULL DEFAULT false,
    "userAgent" TEXT,
    "referrer" TEXT,
    "duration" INTEGER,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;
