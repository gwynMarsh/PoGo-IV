function calculateCP(base, atkIV, defIV, hpIV, cpm) {
  const attack = base[0] + atkIV;
  const defense = base[1] + defIV;
  const stamina = base[2] + hpIV;

  return Math.max(
    10,
    Math.floor(
      attack *
      Math.sqrt(defense) *
      Math.sqrt(stamina) *
      cpm *
      cpm / 10
    )
  );
}
