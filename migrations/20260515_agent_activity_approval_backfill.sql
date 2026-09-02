-- Agent activity approval: new registrations require admin approval (guide_approved) before full platform use.
-- Existing agents were created under the previous rule and should remain fully active.
UPDATE users SET guide_approved = true WHERE role = 'agent';
