module.exports = (app, plugin) => {
    return {
      title: 'Magnetic Variation',
      optionKey: 'MAGNETIC_VARIATION',
      keys: ["navigation.magneticVariation"],
  
      callback: (variation) => {
        try {
          return {
            variation: variation, // Signal K ya usa radianes, no se convierte
            source: 1 // 1 = Fuente fija de variación magnética
          };
        } catch (err) {
          console.error("Error en magneticVariation.js:", err);
        }
      }
    };
  };