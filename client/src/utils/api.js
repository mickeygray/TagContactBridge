// src/utils/api.js
import axios from "axios";
import MessageContext from "../context/message/messageContext";
import { useContext } from "react";

export function useApi() {
  const { startLoading, stopLoading, showError } = useContext(MessageContext);

  const instance = axios.create({ baseURL: process.env.REACT_APP_API_URL });

  instance.interceptors.request.use(
    (config) => {
      startLoading();
      return config;
    },
    (error) => {
      stopLoading();
      return Promise.reject(error);
    }
  );

  instance.interceptors.response.use(
    (response) => {
      stopLoading();
      return response;
    },
    (error) => {
      stopLoading();
      showError(error.message || "An error occurred");
      return Promise.reject(error);
    }
  );

  return instance;
}
