-- Email addresses are not case-sensitive: "Tarun.Kumar@x.com" and "tarun.kumar@x.com" are the same
-- mailbox, but the unique index on "User"."email" treated them as different people, so someone who
-- signed up with one spelling could not sign in with the other. Store every address lower-case
-- (the application now does the same) and make the database enforce it.

-- Stop here, loudly, if two accounts differ only by case: they need a human decision (which one to
-- keep) rather than a silent merge.
DO $$
DECLARE
  clash text;
BEGIN
  SELECT lower(trim("email")) INTO clash
  FROM "User"
  GROUP BY lower(trim("email"))
  HAVING count(*) > 1
  LIMIT 1;

  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot lower-case emails: more than one account exists for %. Merge or remove the duplicates first.', clash;
  END IF;
END $$;

UPDATE "User" SET "email" = lower(trim("email")) WHERE "email" <> lower(trim("email"));
UPDATE "Invite" SET "email" = lower(trim("email")) WHERE "email" <> lower(trim("email"));

-- From now on the database itself refuses a second account that differs only by case.
CREATE UNIQUE INDEX "User_email_lower_key" ON "User" (lower("email"));
