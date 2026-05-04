-- Run this entire block in your Supabase SQL Editor

-- ==========================================
-- 1. TABLE CREATION
-- ==========================================

-- PROFILES (Auto-created when user signs up)
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- CONVERSATIONS
create table public.conversations (
  id uuid default gen_random_uuid() primary key,
  participant1_id uuid references public.profiles(id) not null,
  participant2_id uuid references public.profiles(id) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- MESSAGES
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) not null,
  sender_id uuid references public.profiles(id) not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);


-- ==========================================
-- 2. AUTOMATIC PROFILE CREATION TRIGGER
-- ==========================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ==========================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;


-- PROFILES: Users can read all profiles (so they can search for users to chat with)
-- But they can only update their own profile.
create policy "Users can view all profiles"
  on public.profiles for select using (true);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);


-- CONVERSATIONS: You can only Select or Insert if you are one of the participants
create policy "Users can view their conversations"
  on public.conversations for select
  using (auth.uid() = participant1_id or auth.uid() = participant2_id);

create policy "Users can create conversations"
  on public.conversations for insert
  with check (auth.uid() = participant1_id or auth.uid() = participant2_id);


-- MESSAGES: You can only interact with messages belonging to your conversations
create policy "Users can view messages in their conversations"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c 
      where c.id = messages.conversation_id 
      and (c.participant1_id = auth.uid() or c.participant2_id = auth.uid())
    )
  );

create policy "Users can send messages in their conversations"
  on public.messages for insert
  with check (
    -- You must be the sender
    auth.uid() = sender_id and
    -- You must be in the conversation
    exists (
      select 1 from public.conversations c 
      where c.id = messages.conversation_id 
      and (c.participant1_id = auth.uid() or c.participant2_id = auth.uid())
    )
  );
