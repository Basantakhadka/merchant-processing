--
-- PostgreSQL database dump
--

\restrict SFgx4iAq5x7zqGGcQlX1zbdIxdp0cOhxY8NaRT8zf6jTUQbDRCrFXdKyLXdhceJ

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: application_status; Type: TYPE; Schema: public; Owner: merchant
--

CREATE TYPE public.application_status AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'INFO_REQUESTED',
    'APPROVED',
    'REJECTED'
);


ALTER TYPE public.application_status OWNER TO merchant;

--
-- Name: audit_action; Type: TYPE; Schema: public; Owner: merchant
--

CREATE TYPE public.audit_action AS ENUM (
    'LOGIN_SUCCESS',
    'LOGIN_FAILED',
    'APPLICATION_CREATED',
    'APPLICATION_UPDATED',
    'APPLICATION_SUBMITTED',
    'APPLICATION_ASSIGNED',
    'REVIEW_DECISION',
    'RISK_REVIEW_COMPLETED',
    'RISK_REVIEW_FAILED',
    'PAYMENT_CREATED',
    'PAYMENT_SUCCEEDED',
    'PAYMENT_FAILED'
);


ALTER TYPE public.audit_action OWNER TO merchant;

--
-- Name: business_type; Type: TYPE; Schema: public; Owner: merchant
--

CREATE TYPE public.business_type AS ENUM (
    'SOLE_PROPRIETOR',
    'PARTNERSHIP',
    'PRIVATE_LIMITED',
    'PUBLIC_LIMITED',
    'NON_PROFIT'
);


ALTER TYPE public.business_type OWNER TO merchant;

--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: merchant
--

CREATE TYPE public.payment_status AS ENUM (
    'PENDING',
    'SUCCEEDED',
    'FAILED'
);


ALTER TYPE public.payment_status OWNER TO merchant;

--
-- Name: risk_check_status; Type: TYPE; Schema: public; Owner: merchant
--

CREATE TYPE public.risk_check_status AS ENUM (
    'PENDING',
    'COMPLETED',
    'FAILED'
);


ALTER TYPE public.risk_check_status OWNER TO merchant;

--
-- Name: risk_status; Type: TYPE; Schema: public; Owner: merchant
--

CREATE TYPE public.risk_status AS ENUM (
    'NOT_STARTED',
    'PENDING',
    'PASSED',
    'FLAGGED',
    'FAILED',
    'ERROR'
);


ALTER TYPE public.risk_status OWNER TO merchant;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: merchant
--

CREATE TYPE public.user_role AS ENUM (
    'ADMIN',
    'REVIEWER',
    'SALES'
);


ALTER TYPE public.user_role OWNER TO merchant;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: merchant
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    action public.audit_action NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id character varying(64),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO merchant;

--
-- Name: merchant_applications; Type: TABLE; Schema: public; Owner: merchant
--

CREATE TABLE public.merchant_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_name character varying(200) NOT NULL,
    legal_business_name character varying(200) NOT NULL,
    business_type public.business_type NOT NULL,
    owner_name character varying(150) NOT NULL,
    owner_email character varying(255) NOT NULL,
    owner_phone character varying(30) NOT NULL,
    owner_national_id_enc text,
    expected_monthly_volume numeric(14,2) NOT NULL,
    average_ticket_size numeric(14,2) NOT NULL,
    currency character(3) NOT NULL,
    status public.application_status DEFAULT 'DRAFT'::public.application_status NOT NULL,
    risk_status public.risk_status DEFAULT 'NOT_STARTED'::public.risk_status NOT NULL,
    risk_score integer,
    submission_count integer DEFAULT 0 NOT NULL,
    decision_notes text,
    decided_at timestamp with time zone,
    submitted_at timestamp with time zone,
    created_by_id uuid NOT NULL,
    assigned_reviewer_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT merchant_applications_average_ticket_size_check CHECK ((average_ticket_size > (0)::numeric)),
    CONSTRAINT merchant_applications_expected_monthly_volume_check CHECK ((expected_monthly_volume > (0)::numeric))
);


ALTER TABLE public.merchant_applications OWNER TO merchant;

--
-- Name: migrations; Type: TABLE; Schema: public; Owner: merchant
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);


ALTER TABLE public.migrations OWNER TO merchant;

--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: merchant
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.migrations_id_seq OWNER TO merchant;

--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: merchant
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: payment_webhook_events; Type: TABLE; Schema: public; Owner: merchant
--

CREATE TABLE public.payment_webhook_events (
    event_id character varying(100) NOT NULL,
    payment_id uuid NOT NULL,
    outcome character varying(20) NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.payment_webhook_events OWNER TO merchant;

--
-- Name: payments; Type: TABLE; Schema: public; Owner: merchant
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    currency character(3) NOT NULL,
    description character varying(200),
    status public.payment_status DEFAULT 'PENDING'::public.payment_status NOT NULL,
    idempotency_key character varying(64) NOT NULL,
    provider_reference character varying(100) NOT NULL,
    failure_reason character varying(200),
    created_by_id uuid NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_amount_check CHECK ((amount > (0)::numeric))
);


ALTER TABLE public.payments OWNER TO merchant;

--
-- Name: risk_checks; Type: TABLE; Schema: public; Owner: merchant
--

CREATE TABLE public.risk_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    submission_no integer NOT NULL,
    status public.risk_check_status DEFAULT 'PENDING'::public.risk_check_status NOT NULL,
    score integer,
    outcome character varying(20),
    provider_reference character varying(100),
    runs integer DEFAULT 0 NOT NULL,
    last_error text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.risk_checks OWNER TO merchant;

--
-- Name: users; Type: TABLE; Schema: public; Owner: merchant
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    name character varying(120) NOT NULL,
    password_hash character varying(100) NOT NULL,
    role public.user_role NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_users_email_lower CHECK (((email)::text = lower((email)::text)))
);


ALTER TABLE public.users OWNER TO merchant;

--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: merchant
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: merchant
--

COPY public.audit_logs (id, actor_id, action, entity_type, entity_id, metadata, created_at) FROM stdin;
41b1e7ba-5866-4fd7-9b34-029ec3ed0288	cffae716-f030-492b-8f6b-799d99f3ce58	LOGIN_FAILED	User	cffae716-f030-492b-8f6b-799d99f3ce58	{"email": "sales1@example.test"}	2026-10-09 03:19:36.588411+00
54f5b568-744c-4244-ba2c-1192b020032e	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	LOGIN_SUCCESS	User	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	{}	2026-10-09 03:20:00.867145+00
d6277f17-ac82-4d72-8749-49b83437d93b	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	LOGIN_SUCCESS	User	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	{}	2026-10-09 07:38:10.462884+00
05f1ca34-ac1d-4643-a7e8-381d704679e0	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	LOGIN_SUCCESS	User	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	{}	2026-10-09 09:57:04.260635+00
7f6d361a-4794-47eb-ada4-d36e2eb39ff4	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	LOGIN_SUCCESS	User	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	{}	2026-10-09 09:57:14.905168+00
bfab69c5-9aa2-477a-8814-4c5e7c374c8c	62369e6a-8f65-40e0-a38c-b3cb774bb34b	LOGIN_SUCCESS	User	62369e6a-8f65-40e0-a38c-b3cb774bb34b	{}	2026-10-09 09:57:15.061945+00
36ac46e7-c1f8-4cf9-8b6a-df04d143ec7f	6e6e5167-abe9-4b5c-a53d-32384e1677c4	LOGIN_SUCCESS	User	6e6e5167-abe9-4b5c-a53d-32384e1677c4	{}	2026-10-09 09:57:15.195285+00
8a54bd5b-4306-4599-a4ac-0365b703ad98	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	APPLICATION_CREATED	MerchantApplication	a8d968a1-e45e-41a7-a74e-c06793a2a3b9	{"status": "DRAFT", "businessName": "[REDACTED]"}	2026-10-09 09:57:15.239648+00
5c32068c-4ac7-4a8c-8743-0708d6f04b43	62369e6a-8f65-40e0-a38c-b3cb774bb34b	APPLICATION_ASSIGNED	MerchantApplication	a8d968a1-e45e-41a7-a74e-c06793a2a3b9	{"reviewerId": "0a733cf9-9002-4061-99fc-650217400b01", "previousReviewerId": null}	2026-10-09 09:57:15.294157+00
d6e3c6f7-3eb9-4ec7-9d4e-edae800653c0	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	APPLICATION_SUBMITTED	MerchantApplication	a8d968a1-e45e-41a7-a74e-c06793a2a3b9	{"submissionNo": 1}	2026-10-09 09:57:15.32424+00
8a62b764-0655-46cf-9983-f3e8f824a197	\N	RISK_REVIEW_COMPLETED	MerchantApplication	a8d968a1-e45e-41a7-a74e-c06793a2a3b9	{"score": 16, "outcome": "PASSED", "reference": "sim-4bfbfb4f7645", "submissionNo": 1}	2026-10-09 09:57:15.365926+00
55489c2a-5b61-4e37-ac81-1b78e88ec1df	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	LOGIN_SUCCESS	User	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	{}	2026-10-09 09:57:23.556093+00
9852b700-6f19-4da2-8022-d2053face1fa	62369e6a-8f65-40e0-a38c-b3cb774bb34b	LOGIN_SUCCESS	User	62369e6a-8f65-40e0-a38c-b3cb774bb34b	{}	2026-10-09 09:57:23.727206+00
9a34bfea-1b02-47ed-8ece-45a02cbf50ad	6e6e5167-abe9-4b5c-a53d-32384e1677c4	LOGIN_SUCCESS	User	6e6e5167-abe9-4b5c-a53d-32384e1677c4	{}	2026-10-09 09:57:23.874406+00
d7077a94-c8ae-4229-b3e7-b4ee2fcdf911	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	APPLICATION_CREATED	MerchantApplication	8fb664b4-9b77-4f2f-83d7-5955cab7093a	{"status": "DRAFT", "businessName": "[REDACTED]"}	2026-10-09 09:57:23.897248+00
bbbf795a-7c9b-416d-8459-0ad27f676f75	62369e6a-8f65-40e0-a38c-b3cb774bb34b	APPLICATION_ASSIGNED	MerchantApplication	8fb664b4-9b77-4f2f-83d7-5955cab7093a	{"reviewerId": "6e6e5167-abe9-4b5c-a53d-32384e1677c4", "previousReviewerId": null}	2026-10-09 09:57:23.933314+00
6117f63d-076b-493d-a9fd-0da19d223c53	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	APPLICATION_SUBMITTED	MerchantApplication	8fb664b4-9b77-4f2f-83d7-5955cab7093a	{"submissionNo": 1}	2026-10-09 09:57:23.956826+00
16a1ef8e-9854-4c6b-b63a-de2a22451a88	\N	RISK_REVIEW_COMPLETED	MerchantApplication	8fb664b4-9b77-4f2f-83d7-5955cab7093a	{"score": 16, "outcome": "PASSED", "reference": "sim-c7239da40f1a", "submissionNo": 1}	2026-10-09 09:57:23.995098+00
646c6178-99c0-4a36-b1eb-61e8bd1a8246	6e6e5167-abe9-4b5c-a53d-32384e1677c4	REVIEW_DECISION	MerchantApplication	8fb664b4-9b77-4f2f-83d7-5955cab7093a	{"to": "APPROVED", "from": "SUBMITTED", "decision": "APPROVE", "hasNotes": false, "riskStatus": "PASSED"}	2026-10-09 09:57:26.511612+00
f579a3a5-c654-4e86-824e-8764f560c950	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	PAYMENT_CREATED	Payment	1674efd3-1f6e-44a5-ac65-66afea09c26a	{"amount": 1500.5, "currency": "NPR", "applicationId": "8fb664b4-9b77-4f2f-83d7-5955cab7093a", "providerReference": "pay_ed1ce5fd0418fcd6838b"}	2026-10-09 09:57:26.549869+00
ee74f146-85df-4e76-9dc7-3d5de5968512	\N	PAYMENT_SUCCEEDED	Payment	1674efd3-1f6e-44a5-ac65-66afea09c26a	{"status": "SUCCEEDED", "eventId": "sim_5b5f7681-c851-4094-bb3d-f885d5802d92", "applicationId": "8fb664b4-9b77-4f2f-83d7-5955cab7093a"}	2026-10-09 09:57:26.611914+00
8c7d6b5e-03cf-4c09-acb6-a79a11f9065e	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	LOGIN_SUCCESS	User	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	{}	2026-10-09 10:02:11.098527+00
ccaa523a-0166-43c6-8ecb-c6f4fcf9aff9	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	APPLICATION_CREATED	MerchantApplication	a91394ca-be3f-483d-a435-445d48798ae4	{"status": "DRAFT", "businessName": "[REDACTED]"}	2026-10-09 10:02:18.44606+00
f6cc8b09-be20-45ab-b594-f3125ebdfb20	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	APPLICATION_SUBMITTED	MerchantApplication	a91394ca-be3f-483d-a435-445d48798ae4	{"submissionNo": 1}	2026-10-09 10:02:21.540619+00
e432924a-71a9-4555-977e-99033ed22f6f	\N	RISK_REVIEW_COMPLETED	MerchantApplication	a91394ca-be3f-483d-a435-445d48798ae4	{"score": 16, "outcome": "PASSED", "reference": "sim-1f36a35c7fbb", "submissionNo": 1}	2026-10-09 10:02:21.619262+00
a9519630-1dad-42c6-b596-6ff73d15ba3c	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	PAYMENT_CREATED	Payment	6228fe6b-a966-4e59-8742-6bdb2f6ec945	{"amount": 1500.5, "currency": "NPR", "applicationId": "8fb664b4-9b77-4f2f-83d7-5955cab7093a", "providerReference": "pay_25f245f62e4119bb96f7"}	2026-10-09 10:03:04.987065+00
\.


--
-- Data for Name: merchant_applications; Type: TABLE DATA; Schema: public; Owner: merchant
--

COPY public.merchant_applications (id, business_name, legal_business_name, business_type, owner_name, owner_email, owner_phone, owner_national_id_enc, expected_monthly_volume, average_ticket_size, currency, status, risk_status, risk_score, submission_count, decision_notes, decided_at, submitted_at, created_by_id, assigned_reviewer_id, created_at, updated_at) FROM stdin;
a8d968a1-e45e-41a7-a74e-c06793a2a3b9	UI Smoke	Pine Works Ltd	PRIVATE_LIMITED	S	s@example.test	+9779800000000	v1:jVRddM9vbsZNAFzz:iv/rskh4CX8NnR0sQfTBSg==:0WPrIGRlQRCtAOXPa7KE	50000.00	25.50	NPR	SUBMITTED	PASSED	16	1	\N	\N	2026-10-09 09:57:15.327+00	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	0a733cf9-9002-4061-99fc-650217400b01	2026-10-09 09:57:15.239648+00	2026-10-09 09:57:15.365926+00
8fb664b4-9b77-4f2f-83d7-5955cab7093a	UI Smoke	Pine Works Ltd	PRIVATE_LIMITED	S	s@example.test	+9779800000000	v1:V3/PkBc0y48Sj8xO:wQGfu8KEBAAbf+EVazLcrg==:hpVCwNQ6BrBfqucpyr3g	50000.00	25.50	NPR	APPROVED	PASSED	16	1	\N	2026-10-09 09:57:26.515+00	2026-10-09 09:57:23.96+00	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	6e6e5167-abe9-4b5c-a53d-32384e1677c4	2026-10-09 09:57:23.897248+00	2026-10-09 09:57:26.511612+00
a91394ca-be3f-483d-a435-445d48798ae4	Himalayan Coffee	Pine Works Ltd	SOLE_PROPRIETOR	Sita Sharma	sita@example.test	+9779800000000	v1:6JuwZvMnbsY3Ew0z:CtQ7a3+WNMd6ZTfBb3oA2g==:hDYCKk8m+fsKnzozZG8H	50000.00	25.50	NPR	SUBMITTED	PASSED	16	1	\N	\N	2026-10-09 10:02:21.544+00	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	\N	2026-10-09 10:02:18.44606+00	2026-10-09 10:02:21.619262+00
\.


--
-- Data for Name: migrations; Type: TABLE DATA; Schema: public; Owner: merchant
--

COPY public.migrations (id, "timestamp", name) FROM stdin;
1	1760000000000	InitialSchema1760000000000
2	1761000000000	Payments1761000000000
\.


--
-- Data for Name: payment_webhook_events; Type: TABLE DATA; Schema: public; Owner: merchant
--

COPY public.payment_webhook_events (event_id, payment_id, outcome, received_at) FROM stdin;
sim_5b5f7681-c851-4094-bb3d-f885d5802d92	1674efd3-1f6e-44a5-ac65-66afea09c26a	APPLIED	2026-10-09 09:57:26.611914+00
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: merchant
--

COPY public.payments (id, application_id, amount, currency, description, status, idempotency_key, provider_reference, failure_reason, created_by_id, completed_at, created_at, updated_at) FROM stdin;
1674efd3-1f6e-44a5-ac65-66afea09c26a	8fb664b4-9b77-4f2f-83d7-5955cab7093a	1500.50	NPR	\N	SUCCEEDED	ui-key-12345678	pay_ed1ce5fd0418fcd6838b	\N	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	2026-10-09 09:57:26.616+00	2026-10-09 09:57:26.549869+00	2026-10-09 09:57:26.611914+00
6228fe6b-a966-4e59-8742-6bdb2f6ec945	8fb664b4-9b77-4f2f-83d7-5955cab7093a	1500.50	NPR	Onboarding fee	PENDING	0403341d-d5d1-4c7a-803b-7365837d2677	pay_25f245f62e4119bb96f7	\N	2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	\N	2026-10-09 10:03:04.987065+00	2026-10-09 10:03:04.987065+00
\.


--
-- Data for Name: risk_checks; Type: TABLE DATA; Schema: public; Owner: merchant
--

COPY public.risk_checks (id, application_id, submission_no, status, score, outcome, provider_reference, runs, last_error, completed_at, created_at, updated_at) FROM stdin;
d5ef8329-539e-44eb-9b91-c6b026906ee5	a8d968a1-e45e-41a7-a74e-c06793a2a3b9	1	COMPLETED	16	PASSED	sim-4bfbfb4f7645	0	\N	2026-10-09 09:57:15.368+00	2026-10-09 09:57:15.32424+00	2026-10-09 09:57:15.365926+00
9fcaef98-5c5c-45fc-9e1d-dc07632ec077	8fb664b4-9b77-4f2f-83d7-5955cab7093a	1	COMPLETED	16	PASSED	sim-c7239da40f1a	0	\N	2026-10-09 09:57:23.997+00	2026-10-09 09:57:23.956826+00	2026-10-09 09:57:23.995098+00
4e25d3a1-b546-4048-a57e-9368c5697b92	a91394ca-be3f-483d-a435-445d48798ae4	1	COMPLETED	16	PASSED	sim-1f36a35c7fbb	0	\N	2026-10-09 10:02:21.622+00	2026-10-09 10:02:21.540619+00	2026-10-09 10:02:21.619262+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: merchant
--

COPY public.users (id, email, name, password_hash, role, is_active, created_at) FROM stdin;
62369e6a-8f65-40e0-a38c-b3cb774bb34b	admin@example.test	Ada Admin	$2b$10$/jSppM.kdxZwO/g863JEeeI3Gv3PxbWVsVZSbyRG69RMVJEy0FtE6	ADMIN	t	2026-10-09 03:19:55.111393+00
6e6e5167-abe9-4b5c-a53d-32384e1677c4	reviewer1@example.test	Rita Reviewer	$2b$10$.oZ.UVuiAYApPKDlm6KcYOkdcHo2vyTHO/KtVFsi39Qr.bA8Q99MK	REVIEWER	t	2026-10-09 03:19:55.245017+00
0a733cf9-9002-4061-99fc-650217400b01	reviewer2@example.test	Ravi Reviewer	$2b$10$jslvJiOeSSRrPFcntRrLi.DWKpi.k5bu5JiCH2MnAF.YXUPpl9ZQe	REVIEWER	t	2026-10-09 03:19:55.376454+00
2e76f5ed-b8c5-4456-bf4f-e53e86173dd1	sales1@example.test	Sam Sales	$2b$10$P75PqvWqV2eXESwel3PcFOUfxGwbmNqGNvQgnQ2nS6ZTQxEyvEZye	SALES	t	2026-10-09 03:19:55.508001+00
5e4702a8-66f5-4b85-aabe-e7a38543f1fe	sales2@example.test	Sara Sales	$2b$10$h1TkuQdrGAod8xreA4vswOHvzluWC4rLQIPUn5K9qS/IJY9iUW6yi	SALES	t	2026-10-09 03:19:55.634038+00
\.


--
-- Name: migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: merchant
--

SELECT pg_catalog.setval('public.migrations_id_seq', 2, true);


--
-- Name: migrations PK_8c82d7f526340ab734260ea46be; Type: CONSTRAINT; Schema: public; Owner: merchant
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: merchant
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: merchant_applications merchant_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: merchant
--

ALTER TABLE ONLY public.merchant_applications
    ADD CONSTRAINT merchant_applications_pkey PRIMARY KEY (id);


--
-- Name: payment_webhook_events payment_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: merchant
--

ALTER TABLE ONLY public.payment_webhook_events
    ADD CONSTRAINT payment_webhook_events_pkey PRIMARY KEY (event_id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: merchant
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: risk_checks risk_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: merchant
--

ALTER TABLE ONLY public.risk_checks
    ADD CONSTRAINT risk_checks_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: merchant
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: IDX_apps_created_by_status; Type: INDEX; Schema: public; Owner: merchant
--

CREATE INDEX "IDX_apps_created_by_status" ON public.merchant_applications USING btree (created_by_id, status);


--
-- Name: IDX_apps_reviewer_status; Type: INDEX; Schema: public; Owner: merchant
--

CREATE INDEX "IDX_apps_reviewer_status" ON public.merchant_applications USING btree (assigned_reviewer_id, status);


--
-- Name: IDX_apps_status_created; Type: INDEX; Schema: public; Owner: merchant
--

CREATE INDEX "IDX_apps_status_created" ON public.merchant_applications USING btree (status, created_at);


--
-- Name: IDX_audit_actor; Type: INDEX; Schema: public; Owner: merchant
--

CREATE INDEX "IDX_audit_actor" ON public.audit_logs USING btree (actor_id, created_at);


--
-- Name: IDX_audit_entity; Type: INDEX; Schema: public; Owner: merchant
--

CREATE INDEX "IDX_audit_entity" ON public.audit_logs USING btree (entity_type, entity_id, created_at);


--
-- Name: IDX_payments_app_created; Type: INDEX; Schema: public; Owner: merchant
--

CREATE INDEX "IDX_payments_app_created" ON public.payments USING btree (application_id, created_at);


--
-- Name: IDX_payments_app_idem; Type: INDEX; Schema: public; Owner: merchant
--

CREATE UNIQUE INDEX "IDX_payments_app_idem" ON public.payments USING btree (application_id, idempotency_key);


--
-- Name: IDX_payments_provider_ref; Type: INDEX; Schema: public; Owner: merchant
--

CREATE UNIQUE INDEX "IDX_payments_provider_ref" ON public.payments USING btree (provider_reference);


--
-- Name: IDX_risk_checks_app_submission; Type: INDEX; Schema: public; Owner: merchant
--

CREATE UNIQUE INDEX "IDX_risk_checks_app_submission" ON public.risk_checks USING btree (application_id, submission_no);


--
-- Name: IDX_users_email; Type: INDEX; Schema: public; Owner: merchant
--

CREATE UNIQUE INDEX "IDX_users_email" ON public.users USING btree (email);


--
-- Name: merchant_applications merchant_applications_assigned_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: merchant
--

ALTER TABLE ONLY public.merchant_applications
    ADD CONSTRAINT merchant_applications_assigned_reviewer_id_fkey FOREIGN KEY (assigned_reviewer_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: merchant_applications merchant_applications_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: merchant
--

ALTER TABLE ONLY public.merchant_applications
    ADD CONSTRAINT merchant_applications_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: payment_webhook_events payment_webhook_events_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: merchant
--

ALTER TABLE ONLY public.payment_webhook_events
    ADD CONSTRAINT payment_webhook_events_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: payments payments_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: merchant
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.merchant_applications(id) ON DELETE RESTRICT;


--
-- Name: payments payments_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: merchant
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: risk_checks risk_checks_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: merchant
--

ALTER TABLE ONLY public.risk_checks
    ADD CONSTRAINT risk_checks_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.merchant_applications(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict SFgx4iAq5x7zqGGcQlX1zbdIxdp0cOhxY8NaRT8zf6jTUQbDRCrFXdKyLXdhceJ

