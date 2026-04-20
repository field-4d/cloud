import json
import requests
import pandas as pd
import time
import os

def load_config(file_path="config.json"):
    """
    Loads configuration variables from a JSON file.

    Args:
        file_path (str): Path to the JSON configuration file.

    Returns:
        dict: Configuration dictionary.
    """
    try:
        with open(file_path, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        print("Error: Configuration file not found.")
        return None
    except json.JSONDecodeError:
        print("Error: Invalid JSON format.")
        return None

def make_request(url, headers):
    """
    Sends an HTTP GET request to the given URL with the specified headers.

    Args:
        url (str): The URL to send the GET request to.
        headers (dict): A dictionary containing the headers for the request.

    Returns:
        dict: The response JSON parsed into a dictionary, or None if the request failed.
    """
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")
        return None



def process_and_save_data(json_data, params_list, plants, file_name, PLANTS_ID_DICT, 
                          headers, experiment_id, control_system_id,category="All"):
    """
    Processes JSON data from the API and saves it to a CSV file inside a structured folder.

    Args:
        json_data (dict): The JSON data from the API.
        params_list (str | list): A single parameter or a list of parameters.
        plants (list): A list of plant identifiers.
        file_name (str): The name of the CSV file.
        PLANTS_ID_DICT (dict): A dictionary mapping plant IDs to their names.
        headers (dict): Headers containing the Authorization token.
        experiment_id (int): The experiment ID.
        control_system_id (int): The control system ID.
    """
    try:
        # Ensure params_list is a list
        if isinstance(params_list, str):
            params_list = [params_list]

        all_data = []
        timestamps = set()
        # Create slash in category names to underscore to avoid creating subfolders
        safe_category = category.replace("/", "_")

        # Get control system name and experiment name
        control_systems_df = get_control_systems(headers, return_df=True)
        if control_systems_df is None or control_systems_df.empty:
            print("Error: Could not retrieve control system details.")
            return

        control_system_name = control_systems_df.loc[
            control_systems_df.control_system_id == control_system_id, "control_system_name"
        ].values[0]

        experiment_name = control_systems_df.loc[
            (control_systems_df.control_system_id == control_system_id) & 
            (control_systems_df.experiment_id == experiment_id), "experiment_name"
        ].values[0]

        # Construct folder path dynamically
        folder_path = os.path.join('pulled_data', f"{control_system_name}_{experiment_name}",f"{safe_category}")
        os.makedirs(folder_path, exist_ok=True)

        # Iterate over parameters
        for param in params_list:
            if param not in json_data["group1"]["data"]:
                print(f"Warning: Parameter '{param}' not found in JSON data.")
                continue

            arr_data = json_data["group1"]["data"][param]

            # Temporary dictionary to hold values for each plant
            param_data = {"Timestamp": [], **{plant: [] for plant in plants}}

            # Extract timestamps and plant values
            for ts_entry in arr_data:
                timestamp = ts_entry[0]
                timestamps.add(timestamp)
                values = ts_entry[1:]

                param_data["Timestamp"].append(timestamp)

                # Assign plant-specific values
                for i, plant in enumerate(plants):
                    param_data[plant].append(values[i] if i < len(values) else None)  # Handle missing values safely

            # Convert to DataFrame
            param_df = pd.DataFrame(param_data)
            all_data.append(param_df)

        # Combine all parameters into a single DataFrame
        df = pd.concat(all_data, ignore_index=True)

        # Convert timestamps to datetime
        df["Timestamp"] = pd.to_datetime(df["Timestamp"])
        df.set_index("Timestamp", inplace=True)

        # Rename plant columns based on PLANTS_ID_DICT
        df.columns = [PLANTS_ID_DICT.get(int(col), col) for col in df.columns]
        
        # Save the file inside the structured folder
        file_path = os.path.join(folder_path, file_name)

        # # It's good practice to ensure that the path string is valid, especially if names contain special characters or spaces
        file_path = os.path.normpath(file_path)  # Normalize the path
        df.to_csv(file_path)
        print(f"Data saved to {file_path}")

    except KeyError as e:
        print(f"Key error processing data: {e}")
    except Exception as e:
        print(f"Error during data processing: {e}")






def build_url(experiment_id, control_system_id, start_date, yesterday, plants, params):
    """
    Constructs the API request URL with the given parameters.

    Args:
        experiment_id (int): The experiment ID.
        control_system_id (int): The control system ID.
        start_date (str): Start date in YYYY-MM-DD format.
        yesterday (str): End date in YYYY-MM-DD format.
        plants (list): List of plant IDs.
        params (str): The parameter to fetch.

    Returns:
        str: The constructed URL.
    """
    return (
        f"http://spac.plant-ditech.com/api/data/getData?"
        f"experimentId={experiment_id}&"
        f"controlSystemId={control_system_id}&"
        f"fromDate={start_date}T00:00:00.000Z&"
        f"toDate={yesterday}T23:59:59.999Z&"
        f"plants={','.join(map(str, plants))}&"
        f"params={params}"
    )


def get_control_systems(headers,return_df=False):
    """
    Fetches control system data from the API, processes it, and saves it as a CSV file.

    Args:
        headers (dict): A dictionary containing the headers for the request, including Authorization.

    Returns:
        str: Path to the saved CSV file or an error message.
    """
    url = "https://api.spac.plant-ditech.com/api/controlsystem"
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()  # This will raise an exception for HTTP errors
        data = response.json()
        
        # Flatten the JSON data into a table
        flattened_data = []
        for entry in data:
            for experiment in entry['experiments']:
                flattened_data.append({
                    'control_system_id': entry['id'],
                    'control_system_name': entry['name'],
                    'experiment_id': experiment['iD'],
                    'experiment_name': experiment['name'],
                    'state': experiment['state'],
                    'start_time': experiment.get('startTime', None),
                    'end_time': experiment.get('endTime', None),
                    'zero_hour': experiment['zeroHour'],
                    'daily_weight_start': experiment['dailyWeightStart'],
                    'daily_weight_duration': experiment['dailyWeightDuration'],
                    'active': experiment['active'],
                    'admin_name': experiment.get('adminName', None),
                    'admin_email': experiment.get('adminEmail', None),
                    'watering_frequency': experiment['wateringFrequency']
                })

        # Convert the list of dictionaries to a DataFrame
        df = pd.DataFrame(flattened_data)

        # Ensure the directory exists
        directory = "control_system"
        if not os.path.exists(directory):
            os.makedirs(directory)

        # Save the DataFrame
        file_path = os.path.join(directory, "control_system_data.csv")
        df.to_csv(file_path, index=False)
        if return_df:
            return df
        
        return f"Data saved to {file_path}"

    except requests.exceptions.RequestException as e:
        return f"Request failed: {e}"

    except Exception as e:
        return f"Error processing data: {e}"
    


def get_plant_table(headers, experiment_id, control_system_id,return_df=False):
    """
    Fetches plant and label data from the API for specified experiment and control system, processes it, and saves it as a CSV file.

    Args:
        headers (dict): A dictionary containing the headers for the request, including Authorization.
        experiment_id (int): The experiment ID to fetch data for.
        control_system_id (int): The control system ID to fetch data for.

    Returns:
        str: Path to the saved CSV file or an error message.
    """
    url = f"https://api.spac.plant-ditech.com/api/plantsandlabels?experimentId={experiment_id}&controlSystemId={control_system_id}"
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()  # This will raise an exception for HTTP errors
        data = response.json()
        
        # Flatten the JSON data into a table
        plants = []
        for plant in data['plants']:
            plants.append({
                'ID': plant['iD'],
                'Name': plant['name'],
                'Active': plant['active']
            })

        # Convert the list of dictionaries to a DataFrame
        df = pd.DataFrame(plants)

        # Ensure the directory exists
        directory = "get_plant_table"
        if not os.path.exists(directory):
            os.makedirs(directory)

        control_systems_df = get_control_systems(headers,return_df=True)
        # get the control system name and experiment name
        control_system_name = control_systems_df[control_systems_df.control_system_id == control_system_id]["control_system_name"].values[0]
        experiment_id_name = control_systems_df[(control_systems_df.control_system_id==42) & (control_systems_df.experiment_id==3)]["experiment_name"].values[0]      
        # Save the DataFrame
        file_path = os.path.join(directory, f"{control_system_name}_{experiment_id_name}_get_plant_table.csv")
        df.to_csv(file_path, index=False)
        if return_df:
            return df
        
        return f"Data saved to {file_path}"

    except requests.exceptions.RequestException as e:
        return f"Request failed: {e}"

    except Exception as e:
        return f"Error processing data: {e}"

import os
import requests
import pandas as pd

def get_experiment_parameters(headers, experiment_id, control_system_id, return_df=False):
    """
    Fetches experiment parameters from the API and saves them to a CSV file.

    Args:
        headers (dict): A dictionary containing the headers for the request, including Authorization.
        experiment_id (int): The experiment ID.
        control_system_id (int): The control system ID.
        return_df (bool, optional): Whether to return a DataFrame instead of saving to a file. Defaults to False.

    Returns:
        str: Path to the saved CSV file or an error message.
        pd.DataFrame: DataFrame of experiment parameters if return_df=True.
    """
    url = f"https://api.spac.plant-ditech.com/api/parameters?experimentId={experiment_id}&controlSystemId={control_system_id}"

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()  # Raise an error for failed requests
        json_data = response.json()

        if not json_data:
            print("Warning: No parameters returned from the API.")
            return None if return_df else "No data available"

        # Flatten JSON structure
        data_records = []
        for category, parameters in json_data.items():
            for param in parameters:
                data_records.append({
                    "Category": category,
                    "Name": param.get("name", "N/A"),
                    "Type": param.get("type", "N/A"),
                    "Value": param.get("value", "N/A"),
                    "Units": param.get("units", "N/A")
                })

        # Convert to DataFrame
        df = pd.DataFrame(data_records)

        # Ensure the directory exists
        directory = "experiment_parameters"
        os.makedirs(directory, exist_ok=True)

        # Fetch control system name and experiment name
        control_systems_df = get_control_systems(headers, return_df=True)
        if control_systems_df is not None and not control_systems_df.empty:
            control_system_name = control_systems_df.loc[
                control_systems_df.control_system_id == control_system_id, "control_system_name"
            ].values[0]

            experiment_name = control_systems_df.loc[
                (control_systems_df.control_system_id == control_system_id) & 
                (control_systems_df.experiment_id == experiment_id), "experiment_name"
            ].values[0]

            # Save the DataFrame
            file_name = f"{control_system_name}_{experiment_name}_experiment_parameters.csv"
            file_path = os.path.join(directory, file_name)
            # It's good practice to ensure that the path string is valid, especially if names contain special characters or spaces
            file_path = os.path.normpath(file_path)  # Normalize the path 
            df.to_csv(file_path, index=False)

            if return_df:
                return df
            return f"Data saved to {file_path}"

        else:
            return "Error: Could not retrieve control system details."

    except requests.exceptions.RequestException as e:
        return f"API request error: {e}"
    except KeyError as e:
        return f"Key error processing data: {e}"
    except Exception as e:
        return f"Error during data processing: {e}"
