# U2 - Capítulo #2
# Título del capítulo #1 de la Unidad 2

lorem ipsum dolor sit amet, consectetur <a href="#">adipiscing elit</a>. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

## Contenido de Video

Copia y pega el codigo 
``` pseudocode
// Declaración explícita de variables
DECLARE Alias : STRING
DECLARE Longitud : INTEGER

// Entrada de datos y validación de longitud
OUTPUT "Por favor, ingrese un alias de jugador (5-15 caracteres):"
INPUT Alias

Longitud <- LENGTH(Alias)

IF Longitud >= 5 AND Longitud <= 15 THEN 
    // Concatenación usando el operador oficial de Cambridge (&)
    OUTPUT "¡Bienvenido al juego, ", Alias, "! Tu cuenta ha sido creada."
ELSE
    OUTPUT "Error: El alias ingresado no cumple con la longitud permitida."
ENDIF
```

```html
<a class="video-card" href="https://youtu.be/ZwNeu833FXU?si=eZzIv-TiZHaTmDsX" target="_blank" rel="noopener noreferrer" data-video-card>
    <div class="video-card__thumbnail-wrap" role="img" aria-label="Miniatura del video">
    <span class="video-card__play" aria-hidden="true">▶</span>
    </div>
    <div class="video-card__details">
    <p class="video-card__eyebrow">Video</p>
    <h3 class="video-card__title" data-video-title>Cargando título...</h3>
    <p class="video-card__metadata">
      <span data-video-author>Cargando información...</span>
      <span data-video-provider></span>
    </p>
    </div>
</a>
```

<a class="video-card" href="https://youtu.be/ZwNeu833FXU?si=eZzIv-TiZHaTmDsX" target="_blank" rel="noopener noreferrer" data-video-card>
    <div class="video-card__thumbnail-wrap" role="img" aria-label="Miniatura del video">
    <span class="video-card__play" aria-hidden="true">▶</span>
    </div>
    <div class="video-card__details">
    <p class="video-card__eyebrow">Video</p>
    <h3 class="video-card__title" data-video-title>Cargando título...</h3>
    <p class="video-card__metadata">
      <span data-video-author>Cargando información...</span>
      <span data-video-provider></span>
    </p>
    </div>
</a>
<hr>
<a class="video-card" href="https://youtu.be/ZwNeu833FXU?si=eZzIv-TiZHaTmDsX" target="_blank" rel="noopener noreferrer" data-video-card>
    <div class="video-card__thumbnail-wrap" role="img" aria-label="Miniatura del video">
    <span class="video-card__play" aria-hidden="true">▶</span>
    </div>
    <div class="video-card__details">
    <p class="video-card__eyebrow">Video</p>
    <h3 class="video-card__title" data-video-title>Cargando título...</h3>
    <p class="video-card__metadata">
      <span data-video-author>Cargando información...</span>
      <span data-video-provider></span>
    </p>
    <p class="video-card__description" data-video-description>Escribe aquí un resumen introductorio del video.</p>
    </div>
</a>
<hr>
<a class="video-card" href="https://youtu.be/I2K_VeNi1Nk?si=CviRDlxbI0Zvcemy" target="_blank" rel="noopener noreferrer" data-video-card>
    <div class="video-card__thumbnail-wrap" role="img" aria-label="Miniatura del video">
    <span class="video-card__play" aria-hidden="true">▶</span>
    </div>
    <div class="video-card__details">
    <p class="video-card__eyebrow">Video</p>
    <h3 class="video-card__title" data-video-title>Cargando título...</h3>
    <p class="video-card__metadata">
      <span data-video-author>Cargando información...</span>
      <span data-video-provider></span>
    </p>
    </div>
</a>


### Estructura HTML Y Etiquetas `<h1>` y `<p>`

## 1. Estructura HTML

<img src="url-de-la-imagen" alt="texto alternativo">
<hr>
<hr>
<hr>
<a href="url-del-video" target="_blank" rel="noopener noreferrer"><video controls src="url-del-video"></video></a>

<a href="url-del-enlace" target="_blank" rel="noopener noreferrer">texto del enlace</a>
<hr>
Empezá por este video:

<iframe width="600" height="355" src="https://www.youtube.com/embed/HMHbOUk4zKs" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>

Para crear una página web básica en HTML necesitarás al menos las siguientes etiquetas:

```html
<!-- Comentarios en HTML -->
<html>
  <head>
   <title>Título de la página</title>
  </head>
  <body>
   <h1>Esto es un título</h1>
   <p>Esto es un párrafo</p>
  </body>
</html>
```


```js
// Comentarios en JavaScript
console.log("Hola mundo!");
```

```css
/*Comentarios en css*/
body {
  color: pink;
}
```


Al leer el código, el _browser_ interpreta: 

- La declaración `DOCTYPE` le avisa al navegador que el documento que va a leer es HTML.
- El texto entre `<html>` y `</html>` define dónde empieza y dónde termina el documento.
- El texto entre `<head>` y `</head>` provee información (**meta data**) sobre el documento. Si bien no forma parte del contenido visible de la página, aporta información adicional que es muy útil para el navegador.
   <!--Un ejemplo no informático de meta data puede ser el género de un libro. Si un libro es de aventura, el lector podrá anticipar algunas situaciones asociadas a ese género, aunque no conozca el contenido particular de esa publicación. -->
- El texto entre `<title>` y `</title>` provee un título para el documento: lo que aparece escrito en la pestaña del navegador. Este contenido será mostrado por los motores de búsqueda en sus resultados.
  - Por ejemplo, _Google_ usa esta meta data para entender el contenido de una página y decidir cómo posicionarla.
- El texto entre `<body>` y `</body>` describe el contenido visible del documento; es decir, lo que el navegador le mostrará al usuario.
- El texto entre `<h1>` y `</h1>` describe un encabezado. El _tag_ `<h1>` ('_Heading_ 1') agranda la letra que contiene y la pone como título o encabezado.
- El texto entre `<p>` y `</p>` describe un párrafo. El _tag_ `<p>` genera un salto de línea al final, dándole forma de párrafo al texto que contiene.


+++ 📚 Glosario

- _Browser_: Se refiere a los navegadores _web_ (por ejemplo: Chrome, IE, Firefox, Safari). 

Según las reglas prescritas de HTML, un _browser_ lee el código de una página y entiende qué contenido tiene que mostrar al usuario y de qué forma.

+++






🛎️ **Recordá**: utilizá el atajo de `html:5` en el VSC para que te aparezca esta estructura automáticamente.


## 2. Etiquetas `<h1>` y `<p>`

Para agregar contenido a la página, como texto o imágenes, podés utilizar etiquetas adicionales de HTML. 

Para profundizar sobre este tema, mirá el siguiente video:
<iframe width="560" height="315" src="https://www.youtube.com/embed/qJfNv9RYrVI" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>

Resumiendo: 
- La etiqueta `<h>` se utiliza para definir un encabezado. Pueden ser de nivel 1 a 6 (`<h1>`, `<h2>`, `<h3>`, `<h4>`, `<h5>`,`<h6>`).
- La etiqueta `<p>` se utiliza para definir un párrafo de texto.



+++ _Autosave_
 
⚠️ **Importante:** recordá activar la función “Autosave” en el VSC para que tus cambios se guarden automáticamente. 

![autoguardado](https://i.imgur.com/SDV8kog.jpg)

También el VSC te permite retrodcer con los cambios.

+++



 Una vez que hayas escrito el código HTML y lo hayas guardado en un archivo con la extensión `.html`, podrás abrir el archivo en un navegador web para ver la página que has creado.
 
 
+++ Cómo Escribir Los Nombres De Los Archivos
 
Te recomendamos alguno de estos tres formatos:

🐍 **snake\_case**: Escribe las palabras en minúsculas, separadas con guiones bajos (_underscores_). 
   - Por ejemplo: palabras\_en\_minuscula\_separadas\_por_underscores 

🥙 **kebab-case**: Escribe las palabras en minúsculas y las separa con guiones medios.
   
  - Por ejemplo: 
  palabras-en-minuscula-separadas-por-guiones

🐪 **camelCase**: Escribe la primera palabra en minúscula y las siguientes con su inicial en mayúscula, pero sin usar espacios.

  Por ejemplo: 
  
  laPrimeraPalabraEnMinusculaYLasSiguientesConMayusculaSinUsarEspacios
 
+++

 
  📛 Probá todo esto en tu archivo y avanzá cuando hayas terminado.
