# Bibliothèque de formules

La bibliothèque de formules apporte des formules prêtes à l'emploi et vérifiées dans le langage d'expressions de la [Requête Perspective](frontmatter-query.md) : humidité et point de rosée, mathématiques financières, pourcentages, conversion d'unités, indice de masse corporelle et constantes physiques. Une formule calcule partout où l'application calcule et donne partout le même résultat pour les mêmes valeurs : dans les [calculs en ligne](inline.md) du texte courant, dans les colonnes calculées de la [Perspective Datatable](datatable.md), dans les requêtes et dans les champs formule des [profils de propriétés](property-profiles.md).

```markdown
Point de rosée {= round(humidity.dewpoint(20, 50), 1) =} °C, mensualité {= round(finance.pmt(0.08/12, 10, 10000), 2) =}, température corporelle {= round(unit.celsiustofahrenheit(37), 1) =} °F
```

Point de rosée {= round(humidity.dewpoint(20, 50), 1) =} °C, mensualité {= round(finance.pmt(0.08/12, 10, 10000), 2) =}, température corporelle {= round(unit.celsiustofahrenheit(37), 1) =} °F

S'y ajoutent les fonctions mathématiques de base et les constantes du noyau, comme `round`, `pow` et `pi()`. Elles ne font pas partie de l'extension et calculent toujours (section « Fonctions de base et constantes mathématiques »).

## Appel et valeurs

- **Un espace de noms par catégorie :** une formule s'appelle comme une fonction, avec le nom de sa catégorie avant le point, par exemple `humidity.dewpoint(20, 50)` ou `finance.pmt(0.08/12, 10, 10000)`. Les noms sont anglais comme le reste du catalogue de fonctions, valent dans toutes les versions linguistiques et sont reconnus sans distinction entre majuscules et minuscules.
- **Des nombres purs :** chaque valeur est un nombre dans l'unité indiquée par les tableaux ci-dessous, par exemple la température en °C ou l'humidité relative en pour cent ; le résultat est lui aussi un nombre dans l'unité indiquée. Aucun calcul avec des unités n'a lieu. Un champ contenant un nombre peut remplacer un nombre.
- **Les valeurs entre crochets** sont facultatives et ont une valeur par défaut. On ne peut les omettre qu'à partir de la fin : qui a besoin de la cinquième valeur écrit aussi la quatrième.
- **Les constantes** s'appellent comme une fonction sans valeur, avec des parenthèses : `pi()` ou `const.c()`. Un mot sans parenthèses reste ce qu'il est, le nom d'un champ : une propriété `pi` reste une propriété.
- **Pas d'écritures abrégées :** il n'y a ni opérateur de puissance `^`, ni opérateur de reste, ni notation en pour cent comme `8%`, ni nombre avec exposant comme `1e-5`. `pow` et `mod` calculent puissance et reste, un très petit nombre s'écrit comme une fraction telle que `1/100000`, et un pourcentage est un nombre.
- **Affichage du résultat :** les résultats s'affichent comme tous les résultats de calcul, avec le point comme séparateur décimal, les très grandes et très petites valeurs en notation exponentielle, par exemple `6.02214076e+23`. On arrondit avec `round` et on présente selon la langue avec `numberformat` et `currencyformat`, par exemple `numberformat(humidity.dewpoint(20, 50), 1)`.

## Extension et mode de travail

Les formules des catégories appartiennent à l'extension **« Bibliothèque de formules »** sous « Fichier → Paramètres → Extensions ». Elle est activée dans le mode de travail **Complet** et désactivée dans les modes Avancé et Débutant ; son interrupteur se règle individuellement dans chaque mode (page [Extensions](extensions.md)). Un changement agit dans les documents ouverts au prochain calcul, sans redémarrage.

**Désactivée**, un appel reste inchangé dans le source et affiche à la place du résultat l'avis **« Bibliothèque de formules désactivée »** au lieu du message d'une fonction inconnue, sous la forme dans laquelle l'endroit affiche les messages :

- **Calcul en ligne dans le texte courant :** le signe d'avertissement ⚠︎, l'avis au survol.
- **Colonne calculée d'une datatable :** un tiret « — » dans chaque cellule de la colonne, l'avis au survol. Les autres colonnes continuent de calculer et le tableau reste modifiable.
- **Requête :** le bloc affiche l'avis au lieu de son résultat, comme pour toute erreur d'une requête.
- **Champ formule d'un profil de propriétés :** le champ reste vide et l'avis s'affiche au champ.
- **Règles de la [base de données](database.md) :** une règle de contrôle ou une condition de modification qui utilise une formule de la bibliothèque n'est pas supprimée, mais compte comme non évaluable : une sauvegarde qui devrait la vérifier est refusée, et une condition de modification verrouille l'enregistrement. Un avis dans la définition en nomme la raison. Dans un formulaire, un espace réservé de valeur avec une telle formule reste vide et marqué, et une section conditionnelle reste masquée. Après la réactivation, tout agit comme avant.

**Les fonctions de base et les constantes du noyau calculent toujours**, dans chaque mode de travail et aussi avec la bibliothèque désactivée, et aucun autre calcul ne change par l'interrupteur.

## Fonctions de base et constantes mathématiques

Dix fonctions de base et quatre constantes font partie du noyau du catalogue de fonctions, sans interrupteur. L'arrondi et le reste suivent la norme OpenFormula (ISO/IEC 26300), sections « ROUND » et « MOD » ; les constantes donnent leur valeur avec la pleine précision d'un nombre à virgule flottante.

| Fonction | But | Valeurs → résultat | Exemple |
|---|---|---|---|
| `exp(x)` | fonction exponentielle, e puissance x | nombre → nombre | `exp(0)` donne 1 |
| `ln(x)` | logarithme naturel | nombre supérieur à 0 → nombre | `ln(e())` donne 1 |
| `log10(x)` | logarithme de base 10 | nombre supérieur à 0 → nombre | `log10(1000)` donne 3 |
| `pow(x, y)` | puissance, x puissance y | base, exposant → nombre | `pow(2, 10)` donne 1024 |
| `sqrt(x)` | racine carrée | nombre à partir de 0 → nombre | `sqrt(16)` donne 4 |
| `round(x[, n])` | arrondir à n décimales (par défaut 0) ; une valeur exactement au milieu s'arrondit en s'éloignant de zéro, un n négatif arrondit à gauche de la virgule | nombre, [décimales] → nombre | `round(2.5)` donne 3, `round(-2.5)` donne −3, `round(pi() * 2, 2)` donne 6.28, `round(1234, -2)` donne 1200 |
| `abs(x)` | valeur absolue | nombre → nombre à partir de 0 | `abs(-3)` donne 3 |
| `floor(x)` | arrondir au nombre entier inférieur | nombre → nombre entier | `floor(-1.5)` donne −2 |
| `ceil(x)` | arrondir au nombre entier supérieur | nombre → nombre entier | `ceil(-1.5)` donne −1 |
| `mod(a, b)` | reste de la division ; il porte le signe du diviseur | nombre, diviseur différent de 0 → nombre | `mod(7, 3)` donne 1, `mod(-3, 2)` donne 1 |
| `pi()` | nombre π | aucune → 3.141592653589793 | `round(pi() * 2, 2)` donne 6.28 |
| `e()` | nombre d'Euler e | aucune → 2.718281828459045 | `ln(e())` donne 1 |
| `phi()` | nombre d'or (1 + √5) / 2 | aucune → 1.618033988749895 | `round(phi(), 3)` donne 1.618 |
| `sqrt2()` | racine carrée de 2 | aucune → 1.4142135623730951 | `round(sqrt2(), 4)` donne 1.4142 |

Une valeur hors du domaine de définition (racine d'un nombre négatif, logarithme de zéro ou d'un nombre négatif, reste avec un diviseur nul), un texte qui n'est pas un nombre et un résultat au-delà de la plage des nombres représentables donnent l'affichage d'erreur de l'endroit, comme une division par zéro, jamais une valeur comme « NaN » ou « Infinity ». Des valeurs manquantes ou en trop, `pi(2)` compris, sont signalées par l'endroit comme un mauvais nombre d'arguments.

## Humidité et point de rosée

Espace de noms `humidity.`. Températures en °C, humidité relative en pour cent de 0 à 100, pression de vapeur en hPa, humidité absolue en g/m³.

**Source :** formule de Magnus avec les constantes selon D. Sonntag (Meteorologische Zeitschrift, Neue Folge 3, 1994) : au-dessus de l'eau K₁ = 6,112 hPa, K₂ = 17,62, K₃ = 243,12 °C, au-dessus de la glace K₁ = 6,112 hPa, K₂ = 22,46, K₃ = 272,62 °C ; le Guide des instruments et des méthodes d'observation météorologiques de l'Organisation météorologique mondiale (OMM-N° 8, chapitre 4 et annexe 4.B) donne les mêmes constantes et plages. L'humidité absolue découle de l'équation des gaz de la vapeur d'eau avec la constante spécifique 461,52 J/(kg·K).

| Formule | But | Valeurs → résultat | Exemple | Domaine de validité |
|---|---|---|---|---|
| `humidity.saturationpressure(t)` | pression de vapeur saturante au-dessus de l'eau | température °C → hPa | `humidity.saturationpressure(20)` donne environ 23.33 | −45 à 60 °C |
| `humidity.saturationpressureice(t)` | pression de vapeur saturante au-dessus de la glace | température °C → hPa | `humidity.saturationpressureice(-10)` donne environ 2.60 | −65 à 0,01 °C |
| `humidity.vaporpressure(t, rh)` | pression de vapeur à partir de l'humidité relative | température °C, humidité relative % → hPa | `humidity.vaporpressure(20, 50)` donne environ 11.66 | −45 à 60 °C, humidité de 0 à 100 % |
| `humidity.absolute(t, rh)` | humidité absolue à partir de l'humidité relative | température °C, humidité relative % → g/m³ | `humidity.absolute(21, 40)` donne environ 7.31 | −45 à 60 °C, humidité de 0 à 100 % |
| `humidity.relative(t, ah)` | humidité relative à partir de l'humidité absolue | température °C, humidité absolue g/m³ → % | `humidity.relative(34.4, 7.6)` donne environ 19.87 | −45 à 60 °C, humidité absolue de 0 jusqu'à la valeur de saturation |
| `humidity.dewpoint(t, rh)` | point de rosée | température °C, humidité relative % → °C | `round(humidity.dewpoint(20, 50), 1)` donne 9.3 | −45 à 60 °C, humidité de plus de 0 à 100 %, point de rosée à partir de −45 °C |
| `humidity.relativefromdewpoint(t, td)` | humidité relative à partir du point de rosée | température °C, point de rosée °C → % | `humidity.relativefromdewpoint(20, 9.26)` donne environ 50 | les deux de −45 à 60 °C, point de rosée pas au-dessus de la température |

- **En dessous de 0 °C**, la pression de vapeur, l'humidité absolue et relative et le point de rosée se calculent au-dessus de l'eau (eau surfondue), comme le prévoit la convention météorologique pour l'humidité relative (OMM-N° 8, annexe 4.A) ; seule `humidity.saturationpressureice` donne la valeur au-dessus de la glace.
- **Une approximation :** entre point de rosée et humidité relative, il n'existe que des approximations ; la formule de Magnus s'écarte de tables plus précises de quelques pour mille. Le calcul vaut pour la vapeur d'eau pure, sans le facteur de correction de l'air humide sous pression atmosphérique.
- **Plus que saturé** est hors du domaine : un point de rosée au-dessus de la température ou une humidité absolue au-dessus de la valeur de saturation donnerait une humidité relative supérieure à 100 % et affiche un message.

## Mathématiques financières

Espace de noms `finance.`. Le **taux d'intérêt** est une part par période, donc `0.08/12` pour 8 pour cent par an avec des mensualités. **Règle des signes :** l'argent versé est négatif, l'argent reçu positif. **Moment du paiement** `type` : 0 en fin de période (par défaut), 1 en début de période. Les résultats sont des montants dans la devise des valeurs ou un taux sous forme de part ; aucune devise n'est vérifiée.

**Source :** norme OpenFormula (ISO/IEC 26300), sections des fonctions de même nom (« PMT », « PV », « FV », « NPV », « IRR », « RATE », « NPER », « EFFECT », « NOMINAL »), avec l'équation d'annuité 0 = pv · (1 + rate)^nper + pmt · (1 + rate · type) · ((1 + rate)^nper − 1) / rate + fv et le cas particulier d'un taux nul : pmt · nper + pv + fv = 0.

| Formule | But | Valeurs → résultat | Exemple | Domaine de validité |
|---|---|---|---|---|
| `finance.pmt(rate, nper, pv[, fv[, type]])` | versement d'une annuité | taux par période, durée en périodes, valeur actuelle, [valeur future = 0], [moment = 0] → versement | `finance.pmt(0.08/12, 10, 10000)` donne environ −1037.03, avec le moment 1 environ −1030.16 | taux supérieur à −1, durée supérieure à 0 |
| `finance.pv(rate, nper, pmt[, fv[, type]])` | valeur actuelle | taux, durée, versement, [valeur future = 0], [moment = 0] → valeur actuelle | `finance.pv(0.08/12, 48, 500, 20000)` donne environ −35019.37 | taux supérieur à −1 |
| `finance.fv(rate, nper, pmt[, pv[, type]])` | valeur future | taux, durée, versement, [valeur actuelle = 0], [moment = 0] → valeur future | `finance.fv(0.06/12, 10, -200, -500, 1)` donne environ 2581.40 | taux supérieur à −1 |
| `finance.npv(rate, value1[, value2, …])` | valeur actuelle nette | taux, flux → valeur actuelle nette | `finance.npv(0.1, -10000, 3000, 4200, 6800)` donne environ 1188.44 | taux supérieur à −1 ; le premier flux se situe une période après le début, un flux au début s'ajoute à l'extérieur |
| `finance.irr(values[, guess])` | taux de rendement interne | flux sous forme de champ liste, [estimation = 0.1] → taux | avec le champ liste `paiements: [-10000, 3500, 7600, 1000]`, `finance.irr(paiements)` donne environ 0.1133 | au moins un flux négatif et un positif, estimation supérieure à −1 |
| `finance.rate(nper, pmt, pv[, fv[, type[, guess]]])` | taux d'une annuité | durée, versement, valeur actuelle, [valeur future = 0], [moment = 0], [estimation = 0.1] → taux par période | `finance.rate(48, -200, 8000)` donne environ 0.0077, soit 0,77 % par mois | durée supérieure à 0, estimation supérieure à −1 |
| `finance.nper(rate, pmt, pv[, fv[, type]])` | durée d'une annuité | taux, versement, valeur actuelle, [valeur future = 0], [moment = 0] → durée en périodes | `finance.nper(0.12/12, -100, -1000, 10000, 1)` donne environ 59.67 | taux supérieur à −1 ; une durée négative est un résultat valide |
| `finance.effect(rate, periods)` | taux effectif à partir du taux nominal | taux nominal sous forme de part, périodes de capitalisation par an → taux effectif sous forme de part | `finance.effect(0.0525, 4)` donne environ 0.053543 | taux nominal à partir de 0, périodes à partir de 1 |
| `finance.nominal(rate, periods)` | taux nominal à partir du taux effectif | taux effectif sous forme de part, périodes de capitalisation par an → taux nominal sous forme de part | `finance.nominal(0.053543, 4)` donne environ 0.0525 | taux effectif supérieur à 0, périodes à partir de 1 |

Le nombre de périodes de capitalisation est un nombre entier ; une partie décimale est tronquée. Le taux de rendement interne et le taux se calculent pas à pas ; si le calcul ne trouve pas de solution, il affiche le message « Taux d'intérêt indéterminable : le calcul itératif ne converge pas », et une durée qui n'est jamais atteinte avec les valeurs signale « Nombre de périodes indéterminable ».

### Flux pour la valeur actuelle nette et le taux de rendement interne

- **Valeur actuelle nette :** les flux sont donnés comme valeurs séparées, chacune un nombre ou un champ liste, et comptent dans l'ordre des valeurs ; jusqu'à 254 valeurs de flux sont possibles. La valeur actuelle nette calcule donc aux quatre endroits.
- **Taux de rendement interne :** les flux sont donnés comme **un champ liste**, par exemple une propriété `paiements: [-10000, 3500, 7600, 1000]` ; le premier flux se situe au début. Le taux de rendement interne calcule donc dans une requête, dans le champ formule d'un profil de propriétés et dans les règles de la base de données. **Le texte courant et les colonnes calculées n'ont pas de listes :** il n'y reçoit qu'un seul nombre et affiche le message « Flux de trésorerie sans changement de signe ».
- Un élément d'une liste de flux qui n'est pas un nombre ou qui manque ne disparaît pas en silence, car cela décalerait les périodes de tous les flux suivants ; il affiche le message « Formule : une valeur manque ou n'est pas un nombre », de même qu'une liste vide.

## Pourcentages

Espace de noms `percent.`. Les valeurs et résultats en pour cent sont des nombres de pour cent, donc 19 pour 19 pour cent.

**Source :** les règles de calcul usuelles des pourcentages, indiquées comme calcul dans le tableau.

| Formule | But | Valeurs → résultat | Calcul | Exemple | Domaine de validité |
|---|---|---|---|---|---|
| `percent.share(part, whole)` | part en pour cent | partie, tout → % | part / whole · 100 | `percent.share(5, 20)` donne 25 | tout différent de 0 |
| `percent.change(old, new)` | variation en pour cent, négative en cas de baisse | ancienne valeur, nouvelle valeur → % | (new − old) / old · 100 | `percent.change(80, 100)` donne 25, `percent.change(100, 80)` donne −20 | ancienne valeur différente de 0 |
| `percent.increase(value, p)` | augmenter d'un pourcentage | valeur, pour cent → valeur | value · (1 + p/100) | `percent.increase(200, 50)` donne 300 | aucune restriction |
| `percent.decrease(value, p)` | diminuer d'un pourcentage | valeur, pour cent → valeur | value · (1 − p/100) | `percent.decrease(200, 50)` donne 100 | aucune restriction |
| `percent.base(w, p)` | valeur de base à partir de la valeur en pour cent | valeur en pour cent, pour cent → valeur de base | w / (p/100) | `percent.base(30, 15)` donne 200 | pour cent différent de 0 |

## Conversion d'unités

Espace de noms `unit.`. Des conversions fixes par paire d'unités, chacune dans les deux sens, avec un nombre comme valeur ; il n'existe pas de système de conversion général avec des unités sous forme de texte.

**Source :** NIST Special Publication 811 (guide d'utilisation du Système international d'unités), annexe B.8 ; tous les facteurs y sont exacts.

| Formules | But | Calcul | Exemple |
|---|---|---|---|
| `unit.celsiustokelvin(t)`, `unit.kelvintocelsius(t)` | Celsius ↔ kelvin | T/K = t/°C + 273,15 | `unit.celsiustokelvin(0)` donne 273.15 |
| `unit.celsiustofahrenheit(t)`, `unit.fahrenheittocelsius(t)` | Celsius ↔ Fahrenheit | t/°C = (t/°F − 32) / 1,8 | `unit.celsiustofahrenheit(37)` donne 98.6, `unit.fahrenheittocelsius(212)` donne 100 |
| `unit.kelvintofahrenheit(t)`, `unit.fahrenheittokelvin(t)` | kelvin ↔ Fahrenheit | T/K = (t/°F + 459,67) / 1,8 | `unit.kelvintofahrenheit(273.15)` donne 32 |
| `unit.inchtometer(x)`, `unit.metertoinch(x)` | pouce ↔ mètre | 1 in = 0,0254 m | `unit.inchtometer(1)` donne 0.0254 |
| `unit.foottometer(x)`, `unit.metertofoot(x)` | pied ↔ mètre | 1 ft = 0,3048 m | `unit.foottometer(1)` donne 0.3048 |
| `unit.yardtometer(x)`, `unit.metertoyard(x)` | yard ↔ mètre | 1 yd = 0,9144 m | `unit.yardtometer(1)` donne 0.9144 |
| `unit.miletometer(x)`, `unit.metertomile(x)` | mille ↔ mètre | 1 mi = 1609,344 m | `unit.miletometer(1)` donne 1609.344 |
| `unit.nauticalmiletometer(x)`, `unit.metertonauticalmile(x)` | mille marin ↔ mètre | 1 M = 1852 m | `unit.nauticalmiletometer(1)` donne 1852 |

**Pas de domaine de validité :** les conversions sont des équations de définition exactes, sans domaine dans la source, et ne vérifient donc aucun domaine ; une valeur négative en kelvin ou une longueur négative se calcule elle aussi selon l'équation. Seuls une valeur qui n'est pas un nombre et un résultat au-delà de la plage des nombres représentables sont signalés. L'aller et le retour redonnent la valeur de départ dans les limites de la précision en virgule flottante.

## Santé

Espace de noms `health.`.

**Source :** Organisation mondiale de la santé (OMS), aide-mémoire « Obesity and overweight » et Global Health Observatory « Body mass index » ; l'exemple est donné par le Bureau régional de l'OMS pour l'Europe dans l'aide-mémoire « Nutrition for a healthy life ».

| Formule | But | Valeurs → résultat | Calcul | Exemple | Domaine de validité |
|---|---|---|---|---|---|
| `health.bmi(mass, height)` | indice de masse corporelle | masse kg, taille m → kg/m² | mass / height² | `round(health.bmi(70, 1.75), 1)` donne 22.9 | masse et taille supérieures à 0 |

La formule ne donne que le nombre et ne l'attribue à aucune classe de poids. Pour le classement, l'OMS indique ces seuils, **qui ne valent que pour les adultes** :

- **Insuffisance pondérale :** moins de 18,5
- **Surpoids :** à partir de 25
- **Obésité :** à partir de 30

Pour les enfants et les adolescents, des seuils selon l'âge et le sexe s'appliquent ; la valeur seule n'y permet aucun classement. L'application ne fait aucune évaluation médicale.

## Constantes physiques

Espace de noms `const.`. Appel comme une fonction sans valeur, avec des parenthèses ; une valeur entre les parenthèses, par exemple `const.c(1)`, est une erreur.

| Constante | Signification | Valeur | Unité | Source |
|---|---|---|---|---|
| `const.c()` | vitesse de la lumière dans le vide | 299792458 (exacte) | m/s | CODATA 2018 |
| `const.g()` | accélération normale de la pesanteur | 9.80665 (exacte) | m/s² | Brochure sur le SI du BIPM, 9e édition |
| `const.t0()` | zéro de l'échelle Celsius en kelvins (température de référence T₀), décalage de la conversion de température | 273.15 (exacte) | K | Brochure sur le SI du BIPM, 9e édition, kelvin |
| `const.na()` | constante d'Avogadro | 6.02214076e+23 (exacte) | 1/mol | CODATA 2018 |
| `const.r()` | constante molaire des gaz | 8.31446261815324 (exacte, produit des constantes d'Avogadro et de Boltzmann) | J/(mol·K) | CODATA 2018 |
| `const.h()` | constante de Planck | 6.62607015e-34 (exacte) | J·s | CODATA 2018 |
| `const.p0()` | pression normale de l'atmosphère normale | 1013.25 (définition) | hPa | Brochure sur le SI du BIPM, atmosphère normale |

`const.t0()` n'est pas le zéro absolu ; celui-ci se situe à 0 K, soit −273,15 °C. Les valeurs s'affichent aux quatre endroits avec tous leurs chiffres, les très grandes et très petites en notation exponentielle.

## Des messages au lieu de valeurs

Une valeur hors du domaine de validité d'une formule ne donne **jamais de valeur**, mais à la place du résultat un message qui nomme la valeur et le domaine, par exemple « Humidité relative hors de la plage de plus de 0 à 100 % » pour `humidity.dewpoint(20, 120)`. Sont signalés de même une valeur manquante ou un texte qui n'est pas un nombre (« Formule : une valeur manque ou n'est pas un nombre »), un résultat au-delà de la plage des nombres représentables et un calcul pas à pas sans solution.

- **Calcul en ligne :** le signe d'avertissement ⚠︎, le message au survol.
- **Colonne calculée :** un tiret « — » dans la cellule, le message au survol ; les autres cellules continuent de calculer, et une colonne qui renvoie à cette cellule reprend le message.
- **Requête :** le signe d'avertissement ⚠︎ dans la cellule, le message au survol ; dans une condition (`WHERE`), le message compte comme non rempli ; au tri (`SORT`), il vient en dernier, et `count` ne le compte pas.
- **Champ formule :** le champ reste vide et le message s'affiche au champ ; un champ qui renvoie à ce champ reprend le message.
- **Règle de la base de données :** une règle de contrôle ou une condition dont la formule donne un message compte comme non évaluable ; la sauvegarde est refusée, et une condition de modification verrouille l'enregistrement.

## Limites

- **Pas de formules personnelles :** la bibliothèque contient les formules de cette page ; on ne peut pas en ajouter.
- **Pas de calcul avec des unités :** valeurs et résultats sont des nombres purs dans l'unité indiquée.
- **Paires d'unités fixes :** température et longueur sont converties ; la bibliothèque ne convertit ni masse, ni volume, ni énergie, ni pression.
- **Pas de sortie selon la langue :** les résultats s'affichent avec le point comme séparateur décimal ; selon la langue via `numberformat` et `currencyformat`.
