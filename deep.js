/* Deep-sky showpieces (J2000). [id, name, type, RA hours, Dec deg, magnitude, size arcmin, distance light-years, one-line fact]
   Types: galaxy, nebula, cluster, globular, planetary, remnant, blackhole. */
window.SKY_DSO = [
  ['M31', 'Andromeda Galaxy', 'galaxy', 0.7123, 41.269, 3.4, 178, 2.5e6, 'The farthest thing you can see with your bare eyes. It will merge with the Milky Way in ~4.5 billion years.'],
  ['M33', 'Triangulum Galaxy', 'galaxy', 1.5641, 30.660, 5.7, 70, 2.7e6, 'A face-on spiral with around 40 billion stars. Only visible by eye under very dark skies.'],
  ['M51', 'Whirlpool Galaxy', 'galaxy', 13.4979, 47.195, 8.4, 11, 2.3e7, 'Two galaxies caught mid-collision, the first galaxy where spiral arms were ever seen.'],
  ['M81', "Bode's Galaxy", 'galaxy', 9.9259, 69.065, 6.9, 27, 1.2e7, 'A grand spiral that pulls on its neighbour, the Cigar Galaxy.'],
  ['M82', 'Cigar Galaxy', 'galaxy', 9.9312, 69.680, 8.4, 11, 1.2e7, 'A starburst galaxy making new stars ten times faster than the Milky Way.'],
  ['M101', 'Pinwheel Galaxy', 'galaxy', 14.0535, 54.349, 7.9, 29, 2.1e7, 'About 70% bigger across than the Milky Way.'],
  ['M104', 'Sombrero Galaxy', 'galaxy', 12.6665, -11.623, 8.0, 9, 3.1e7, 'Seen almost edge-on, with a dark dust lane across its bright core.'],
  ['M87', 'Virgo A (M87)', 'galaxy', 12.5137, 12.391, 8.6, 8, 5.3e7, 'Home of the first black hole ever photographed, 6.5 billion times the Sun’s mass.'],
  ['LMC', 'Large Magellanic Cloud', 'galaxy', 5.3929, -69.756, 0.9, 600, 1.6e5, 'A satellite galaxy of the Milky Way, easily seen by eye from the southern hemisphere.'],
  ['SMC', 'Small Magellanic Cloud', 'galaxy', 0.8775, -72.829, 2.7, 300, 2.0e5, 'A small companion galaxy being slowly torn apart by the Milky Way.'],
  ['M42', 'Orion Nebula', 'nebula', 5.5881, -5.391, 4.0, 65, 1344, 'The nearest big star nursery. Thousands of stars are being born inside it right now.'],
  ['B33', 'Horsehead Nebula', 'nebula', 5.6817, -2.458, 99, 8, 1375, 'A dark cloud of dust shaped like a horse’s head against glowing gas.'],
  ['M8', 'Lagoon Nebula', 'nebula', 18.0633, -24.383, 6.0, 90, 4100, 'A glowing gas cloud three times wider than the full Moon in the sky.'],
  ['M16', 'Eagle Nebula', 'nebula', 18.3133, -13.783, 6.0, 35, 7000, 'Home of the "Pillars of Creation" photographed by Hubble and Webb.'],
  ['M17', 'Omega Nebula', 'nebula', 18.3467, -16.183, 6.0, 46, 5500, 'One of the brightest and most massive star-forming regions in our galaxy.'],
  ['M20', 'Trifid Nebula', 'nebula', 18.0433, -23.033, 6.3, 28, 5200, 'Split into three lobes by dark lanes of dust.'],
  ['NGC7000', 'North America Nebula', 'nebula', 20.9833, 44.333, 4.0, 120, 2600, 'Shaped like the North American continent, glowing near Deneb.'],
  ['NGC2237', 'Rosette Nebula', 'nebula', 6.5333, 5.050, 4.8, 80, 5200, 'A huge flower-shaped cloud around a young star cluster.'],
  ['NGC3372', 'Carina Nebula', 'nebula', 10.7517, -59.867, 1.0, 120, 8500, 'Contains Eta Carinae, a giant star expected to go supernova.'],
  ['M1', 'Crab Nebula', 'remnant', 5.5753, 22.017, 8.4, 6, 6500, 'The wreck of a star that exploded in 1054 AD, seen by Chinese astronomers in daylight.'],
  ['NGC6960', 'Veil Nebula', 'remnant', 20.7617, 30.717, 7.0, 180, 2400, 'Wisps left by a supernova about 10,000 years ago.'],
  ['M27', 'Dumbbell Nebula', 'planetary', 19.9933, 22.721, 7.5, 8, 1360, 'The glowing shell of a dying Sun-like star.'],
  ['M57', 'Ring Nebula', 'planetary', 18.8933, 33.029, 8.8, 1.4, 2300, 'A smoke-ring of gas blown off by a dying star.'],
  ['NGC7293', 'Helix Nebula', 'planetary', 22.4933, -20.837, 7.6, 25, 650, 'Nicknamed the "Eye of God". Our Sun will look like this in ~5 billion years.'],
  ['M45', 'Pleiades', 'cluster', 3.7833, 24.117, 1.6, 110, 444, 'The Seven Sisters: a young cluster of hot blue stars, about 100 million years old.'],
  ['Mel25', 'Hyades', 'cluster', 4.45, 15.867, 0.5, 330, 153, 'The nearest open cluster to Earth, forming the V of Taurus.'],
  ['M44', 'Beehive Cluster', 'cluster', 8.6683, 19.983, 3.7, 95, 577, 'A swarm of about 1,000 stars, visible as a misty patch by eye.'],
  ['NGC869', 'Double Cluster', 'cluster', 2.3333, 57.133, 3.7, 60, 7500, 'Two star clusters side by side, a showpiece in binoculars.'],
  ['M35', 'M35', 'cluster', 6.1483, 24.333, 5.3, 28, 2800, 'A rich cluster at the feet of Gemini.'],
  ['M7', 'Ptolemy Cluster', 'cluster', 17.8983, -34.817, 3.3, 80, 980, 'Recorded by Ptolemy around 130 AD.'],
  ['M6', 'Butterfly Cluster', 'cluster', 17.6683, -32.217, 4.2, 25, 1600, 'Its stars form the shape of a butterfly.'],
  ['M13', 'Hercules Cluster', 'globular', 16.695, 36.467, 5.8, 20, 22200, 'About 300,000 stars packed in a ball. In 1974 a radio message to aliens was beamed at it.'],
  ['M22', 'M22', 'globular', 18.6067, -23.9, 5.1, 32, 10600, 'One of the nearest globular clusters, over 12 billion years old.'],
  ['M3', 'M3', 'globular', 13.7033, 28.383, 6.2, 18, 34000, 'Around half a million ancient stars.'],
  ['M4', 'M4', 'globular', 16.3933, -26.533, 5.6, 36, 7200, 'Contains some of the oldest white dwarfs known.'],
  ['NGC5139', 'Omega Centauri', 'globular', 13.4467, -47.483, 3.9, 55, 17000, 'The biggest globular cluster, possibly the core of a swallowed galaxy.'],
  ['NGC104', '47 Tucanae', 'globular', 0.4017, -72.081, 4.1, 50, 13000, 'The second-brightest globular cluster, next to the Small Magellanic Cloud.'],
  ['SgrA', 'Sagittarius A*', 'blackhole', 17.7611, -29.008, 99, 0, 26700, 'The black hole at the centre of the Milky Way: 4 million Suns’ worth of mass.']
];

/* Deep-space craft. Directions change slowly; distances grow by a fixed rate per year from a 2025.0 value. */
window.SKY_PROBES = [
  { name: 'Voyager 1', ra: 17.22, dec: 12.0, au2025: 165.2, auPerYr: 3.57, kms: 17.0, launched: 1977, fact: 'The farthest human-made object. It left the solar system’s bubble in 2012.' },
  { name: 'Voyager 2', ra: 20.12, dec: -60.4, au2025: 138.1, auPerYr: 3.25, kms: 15.4, launched: 1977, fact: 'The only craft to visit Uranus and Neptune.' },
  { name: 'New Horizons', ra: 19.73, dec: -20.6, au2025: 60.5, auPerYr: 2.9, kms: 13.7, launched: 2006, fact: 'Flew past Pluto in 2015 and Arrokoth in 2019.' }
];
