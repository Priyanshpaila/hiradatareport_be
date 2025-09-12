# Use a lightweight Node.js base image
FROM node:20-alpine

# Install dependencies without devDependencies
RUN npm install --omit=dev

# App env (you can still override at runtime with --env or --env-file)
ENV PORT=8080
ENV MONGO_URI=mongodb://192.168.13.84/hiranalytics
ENV JWT_SECRET=yehmerascerectkeyhaikisikonahibataunga70

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
# Use npm ci for reproducible installs; omit dev deps in production
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Expose application port
EXPOSE ${PORT}

# Start the server
CMD ["node", "src/server.js"]


# docker build  --no-cache -t 192.168.13.72:5000/analytics_be .      
# docker run -d --name analytics_be -p 8080:8080 analytics_be_image

# docker tag analytics_be_image 192.168.13.72:5000/analytics_be
# docker push 192.168.13.72:5000/analytics_be
# docker pull 192.168.13.72:5000/analytics_be
# docker run -d --name analytics_be -p 8080:8080 192.168.13.72:5000/analytics_be
