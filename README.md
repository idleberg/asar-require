# asar-require

> [!NOTE]
>
> This package is a fork of the abandoned [`asar-require`](https://github.com/electron/asar-require) with notable changes:
> - ported to Typescript
> - replaced vulnerable `asar` package with `@electron/asar`

Enable `require` to read scripts in [asar] packages.

## Usage

```js
require('asar-require');
require('/path/to/archive.asar/script');
```
