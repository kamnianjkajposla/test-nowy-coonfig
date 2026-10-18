FROM node:20-alpine

# Ustawienie katalogu roboczego
WORKDIR /app

# Kopiowanie plików zależności
COPY package*.json ./

# Instalacja pakietów produkcyjnych
RUN npm install --production

# Kopiowanie kodu aplikacji
COPY . .

# Tworzenie bezpiecznego katalogu na dane konfiguracyjne
RUN mkdir -p /app/data

# Otwarcie portu serwera HTTP
EXPOSE 3000

# Uruchomienie bota
CMD ["node", "index.js"]
