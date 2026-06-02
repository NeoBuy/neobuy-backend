'use strict';

const upSql = `
CREATE TABLE product_price_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  variant_id BIGINT UNSIGNED NOT NULL,
  old_price_lkr INT UNSIGNED NOT NULL,
  new_price_lkr INT UNSIGNED NOT NULL,
  changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_product_price_history_variant_id (variant_id),
  KEY idx_product_price_history_changed_at (changed_at),
  CONSTRAINT fk_product_price_history_variant
    FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const downSql = `
DROP TABLE IF EXISTS product_price_history;
`;

exports.up = function (db) {
  return db.runSql(upSql);
};

exports.down = function (db) {
  return db.runSql(downSql);
};

exports._meta = {
  version: 1,
};
