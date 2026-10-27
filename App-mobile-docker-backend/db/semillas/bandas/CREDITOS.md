# Catálogo de bandas

Datos que carga `npm run semilla:bandas` (desde `services/api`): las fotos de las bandas y un catálogo de productos de bandas conocidas.

## Fotos de las bandas

Son fotos reales de cada banda, tomadas de Wikimedia Commons en su versión de 500 px de ancho (o menor, si la original lo es), sin otra modificación. Todas tienen licencia libre o están en el dominio público. Las que exigen atribución la llevan en el crédito que la tienda muestra junto a la foto.

| Archivo | Obra original | Autor | Licencia |
|---|---|---|---|
| `fotos/ac-dc.jpg` | [AC DC Black Ice Tour 2009 Buenos Aires](https://commons.wikimedia.org/wiki/File:AC_DC_Black_Ice_Tour_2009_Buenos_Aires_4_de_Diciembre_(4238680962).jpg) | Ed Vill | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) |
| `fotos/black-sabbath.jpg` | [Sabs](https://commons.wikimedia.org/wiki/File:Sabs.jpg) | Warner Bros. Records | Dominio público |
| `fotos/exodus.jpg` | [Exodus Rockharz 2018 43](https://commons.wikimedia.org/wiki/File:Exodus_Rockharz_2018_43.jpg) | S. Bollmann | Uso con atribución |
| `fotos/guns-n-roses.jpg` | [GNR Belgrade 2025 05 (cropped)](https://commons.wikimedia.org/wiki/File:GNR_Belgrade_2025_05_(cropped).jpg) | AxeAdam20 | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `fotos/iron-maiden.jpg` | [IronMaidencollage2](https://commons.wikimedia.org/wiki/File:IronMaidencollage2.jpg) | adels, Mike Lawrence y otros; ver la página de la obra | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0) |
| `fotos/judas-priest.jpg` | [Judas Priest - Wacken Open Air 2018 01](https://commons.wikimedia.org/wiki/File:Judas_Priest_-_Wacken_Open_Air_2018_01.jpg) | Frank Schwichtenberg | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `fotos/kiss.jpg` | [Kiss original lineup (1976)](https://commons.wikimedia.org/wiki/File:Kiss_original_lineup_(1976).jpg) | Casablanca Records | Dominio público |
| `fotos/led-zeppelin.jpg` | [Led Zeppelin - promotional image (1971)](https://commons.wikimedia.org/wiki/File:Led_Zeppelin_-_promotional_image_(1971).jpg) | Atlantic Records | Dominio público |
| `fotos/megadeth.jpg` | [Megadeth at the O2 Arena, London, 26 October 2025](https://commons.wikimedia.org/wiki/File:Megadeth_at_the_O2_Arena,_London,_26_October_2025.jpg) | Justice for the Beholder of the Harvester of Blackened Straw | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `fotos/metallica.jpg` | [Metallica March 2024](https://commons.wikimedia.org/wiki/File:Metallica_March_2024.jpg) | Library of Congress Life | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `fotos/misfits.jpg` | [Misfits 2012-11-08 01](https://commons.wikimedia.org/wiki/File:Misfits_2012-11-08_01.JPG) | IllaZilla | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) |
| `fotos/motorhead.jpg` | [Motorhead-03](https://commons.wikimedia.org/wiki/File:Motorhead-03.jpg) | Mark Marek Photography | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| `fotos/nirvana.jpg` | [Nirvana around 1992](https://commons.wikimedia.org/wiki/File:Nirvana_around_1992.jpg) | P.B. Rage | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0) |
| `fotos/pantera.jpg` | [Pantera 1987-2003 lineup](https://commons.wikimedia.org/wiki/File:Pantera_1987-2003_lineup.jpg) | April Ashford-Forsythe, Llann Wé² y otros; ver la página de la obra | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) |
| `fotos/queen.jpg` | [Queen A Night At The Opera (1975 Elektra publicity photo 02)](https://commons.wikimedia.org/wiki/File:Queen_A_Night_At_The_Opera_(1975_Elektra_publicity_photo_02).jpg) | Koh Hasebe, distribuida por Elektra Records | Dominio público |
| `fotos/ramones.jpg` | [Ramones rocket to russia photo](https://commons.wikimedia.org/wiki/File:Ramones_rocket_to_russia_photo.jpg) | Danny Fields | Dominio público |
| `fotos/slayer.jpg` | [Slayer, The Fields of Rock, 2007](https://commons.wikimedia.org/wiki/File:Slayer,_The_Fields_of_Rock,_2007.jpg) | Francis, Groningen | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) |

La licencia cubre la foto, no el nombre ni la imagen de la banda: los nombres de las bandas son marcas de sus dueños.

## Productos

Los productos de `catalogo.json` son de muestra: sus nombres, precios, descripciones y cantidades no corresponden a mercadería real. Sus imágenes son ilustraciones que genera el cargador (una prenda con el nombre de la banda), no fotos de las prendas. Antes de vender, hay que ajustar el stock con un conteo y reemplazar cada ilustración por la foto del producto.
