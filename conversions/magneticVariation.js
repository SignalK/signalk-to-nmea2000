module.exports = (app, plugin) => {
  return {
    pgns: [127258],  // Se añade la propiedad pgns como en leeway.js
    title: 'Magnetic Variation (127258)',
    optionKey: 'MAGNETIC_VARIATION',
    keys: ["navigation.magneticVariation"],

    callback: (variation) => {
      try {
        return [
          {
            pgn: 127258,
            "Magnetic Variation": variation
          }
        ];
      } catch (err) {
        console.error("Error en magneticVariation.js:", err);
      }
    },
    tests: [{
      input: [0.12], // Prueba con valor en radianes
      expected: [{
        "prio": 2,
        "pgn": 127258,
        "dst": 255,
        "fields": {
          "Magnetic Variation": 0.12
        }
      }]
    }]
  };
};