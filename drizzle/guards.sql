-- Gardes d'intégrité du secret d'achat et des cadeaux communs.
-- Idempotent : relancé à chaque démarrage après les migrations Drizzle.

CREATE OR REPLACE FUNCTION wish_list_recipient_is_member() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.recipient_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM group_member gm
    WHERE gm.group_id = NEW.group_id AND gm.user_id = NEW.recipient_id
  ) THEN
    RAISE EXCEPTION 'recipient_not_member';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wish_list_recipient_member ON wish_list;
CREATE TRIGGER wish_list_recipient_member
  BEFORE INSERT OR UPDATE OF recipient_id, group_id ON wish_list
  FOR EACH ROW EXECUTE FUNCTION wish_list_recipient_is_member();

CREATE OR REPLACE FUNCTION wish_owner_matches_recipient() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  rec uuid;
BEGIN
  SELECT recipient_id INTO rec FROM wish_list WHERE id = NEW.list_id;
  IF rec IS NOT NULL AND NEW.owner_id IS DISTINCT FROM rec THEN
    RAISE EXCEPTION 'wish_owner_must_be_recipient';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM wish_list wl
    JOIN group_member gm ON gm.group_id = wl.group_id AND gm.user_id = NEW.owner_id
    WHERE wl.id = NEW.list_id
  ) THEN
    RAISE EXCEPTION 'owner_not_in_group';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wish_owner_member ON wish;
CREATE TRIGGER wish_owner_member
  BEFORE INSERT OR UPDATE OF owner_id, list_id ON wish
  FOR EACH ROW EXECUTE FUNCTION wish_owner_matches_recipient();

CREATE OR REPLACE FUNCTION reservation_guards() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  w wish%ROWTYPE;
  g uuid;
BEGIN
  SELECT * INTO w FROM wish WHERE id = NEW.wish_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wish_missing';
  END IF;
  IF w.is_shared THEN
    RAISE EXCEPTION 'shared_wish_not_reservable';
  END IF;
  IF w.owner_id = NEW.buyer_id THEN
    RAISE EXCEPTION 'cannot_reserve_own_wish';
  END IF;
  SELECT group_id INTO g FROM wish_list WHERE id = w.list_id;
  IF NOT EXISTS (
    SELECT 1 FROM group_member WHERE group_id = g AND user_id = NEW.buyer_id
  ) THEN
    RAISE EXCEPTION 'buyer_not_in_group';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reservation_guards_trg ON reservation;
CREATE TRIGGER reservation_guards_trg
  BEFORE INSERT OR UPDATE OF buyer_id, wish_id ON reservation
  FOR EACH ROW EXECUTE FUNCTION reservation_guards();

CREATE OR REPLACE FUNCTION contribution_guards() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  w wish%ROWTYPE;
  g uuid;
BEGIN
  SELECT * INTO w FROM wish WHERE id = NEW.wish_id;
  IF NOT FOUND OR NOT w.is_shared THEN
    RAISE EXCEPTION 'contribution_requires_shared_wish';
  END IF;
  IF w.purchased_at IS NOT NULL THEN
    RAISE EXCEPTION 'contribution_after_purchase';
  END IF;
  IF w.owner_id = NEW.member_id THEN
    RAISE EXCEPTION 'owner_cannot_contribute';
  END IF;
  SELECT group_id INTO g FROM wish_list WHERE id = w.list_id;
  IF NOT EXISTS (
    SELECT 1 FROM group_member WHERE group_id = g AND user_id = NEW.member_id
  ) THEN
    RAISE EXCEPTION 'contributor_not_in_group';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contribution_guards_trg ON contribution;
CREATE TRIGGER contribution_guards_trg
  BEFORE INSERT OR UPDATE OF member_id, wish_id ON contribution
  FOR EACH ROW EXECUTE FUNCTION contribution_guards();
