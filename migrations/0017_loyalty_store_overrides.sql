ALTER TABLE stores
  ADD COLUMN loyalty_earn_rate_override numeric(10,4),
  ADD COLUMN loyalty_redeem_value_override numeric(10,4);
