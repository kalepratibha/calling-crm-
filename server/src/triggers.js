// Triggers keep leads.executive_name / calls.executive_name equal to users.name, so that in phpMyAdmin every
// client and call shows the executive's NAME (not only the numeric id). Never edit those two columns by hand.
module.exports = [
['trg_leads_exec_name_ins', `CREATE TRIGGER trg_leads_exec_name_ins BEFORE INSERT ON leads FOR EACH ROW
  SET NEW.executive_name = (SELECT name FROM users WHERE id = NEW.executive_id)`],
['trg_leads_exec_name_upd', `CREATE TRIGGER trg_leads_exec_name_upd BEFORE UPDATE ON leads FOR EACH ROW
  SET NEW.executive_name = (SELECT name FROM users WHERE id = NEW.executive_id)`],
['trg_calls_exec_name_ins', `CREATE TRIGGER trg_calls_exec_name_ins BEFORE INSERT ON calls FOR EACH ROW
  SET NEW.executive_name = (SELECT name FROM users WHERE id = NEW.executive_id)`],
['trg_users_name_upd', `CREATE TRIGGER trg_users_name_upd AFTER UPDATE ON users FOR EACH ROW
  BEGIN
    IF NEW.name <> OLD.name THEN
      UPDATE leads SET executive_name = NEW.name WHERE executive_id = NEW.id;
      UPDATE calls SET executive_name = NEW.name WHERE executive_id = NEW.id;
    END IF;
  END`],
];
