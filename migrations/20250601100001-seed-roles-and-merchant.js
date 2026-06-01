'use strict';

exports.up = function (db) {
  return db.runSql(`
    INSERT INTO merchants (type, name, status)
    VALUES ('INTERNAL', 'NeoBuy', 'ACTIVE');

    INSERT INTO roles (code) VALUES
      ('CUSTOMER'),
      ('ADMIN');
  `);
};

exports.down = function (db) {
  return db.runSql(`
    DELETE FROM roles WHERE code IN ('CUSTOMER', 'ADMIN');
    DELETE FROM merchants WHERE type = 'INTERNAL' AND name = 'NeoBuy';
  `);
};

exports._meta = {
  version: 1,
};
