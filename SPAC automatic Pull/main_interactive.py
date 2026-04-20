import time
import pandas as pd
import logging
from datetime import datetime
from data_fetcher import (
    build_url, get_control_systems, get_experiment_parameters,
    get_plant_table, load_config, make_request, process_and_save_data
)

# Configure logging with timestamp in the format "YYYY-MM-FF H-m-d"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%d"  # This will output e.g. "2025-03-04 15-23-04"
)

def ask_user(question, options):
    """Ask the user a question and return their choice."""
    while True:
        print(question)
        for i, option in enumerate(options, 1):
            print(f"{i}. {option}")
        choice = input("Enter your choice (number): ")
        if choice.isdigit() and 1 <= int(choice) <= len(options):
            return options[int(choice) - 1]
        print("Invalid choice. Please try again.")

def main():
    """
    Interactive main function to orchestrate data fetching, processing, and saving.
    """
    # Log the start of the program with a timestamp.
    logging.info("Program started at %s", datetime.now().strftime("%Y-%m-%d %H:%M:%d"))
    start_time = time.time()

    # Load configuration
    config = load_config()
    if not config:
        return

    # Assign config values
    AUTHORIZATION = config["AUTHORIZATION"]
    PARAMETERS = config.get("PARAMETERS", [])
    PLANTS_ID = config.get("PLANTS_ID", [])
    FILES = config.get("FILES", [])
    
    headers = {'Authorization': AUTHORIZATION}
    
    # Ask user which operation they want to perform
    task = ask_user("What would you like to do?", [
        "Fetch data for a specific experiment",
        "Fetch data for all available experiments",
        "Exit"
    ])

    if task == "Exit":
        print("Exiting program.")
        logging.info("User exited the program.")
        return
    
    # Fetch control system data
    try:
        control_systems_df = get_control_systems(headers, return_df=True)
        control_systems_df_no_dupp = control_systems_df.drop_duplicates(subset=["control_system_id", "control_system_name"])
        print("Control system data retrieved.")
        logging.info("Control system data retrieved.")
    except Exception as e:
        print(f"Error fetching control systems: {e}")
        logging.error("Error fetching control systems: %s", e)
        return
    print(control_systems_df_no_dupp[["control_system_id", "control_system_name"]])
    
    
    try:
        control_system_id = int(input("Enter the Control System ID: "))
        control_system_name = control_systems_df.loc[
            control_systems_df["control_system_id"] == control_system_id,
            "control_system_name"
        ].values[0]
        confirm = input(f"Did you mean '{control_system_name}'? (y/n): ")
        if confirm.lower() != "y":
            print("Please restart and enter the correct Control System ID.")
            logging.info("User did not confirm the Control System ID.")
            return
    except (ValueError, IndexError):
        print("Invalid input. Please enter a valid numerical ID.")
        logging.error("Invalid Control System ID entered.")
        return
    
    if task == "Fetch data for a specific experiment":
        filtered_experiments = control_systems_df[control_systems_df["control_system_id"] == control_system_id]
        filtered_experiments = filtered_experiments.drop_duplicates(subset=["experiment_id", "experiment_name"])
        print(filtered_experiments[["experiment_id", "experiment_name"]])
        
        try:
            experiment_id = int(input("Enter the Experiment ID: "))
            experiment_name = filtered_experiments.loc[
                filtered_experiments["experiment_id"] == experiment_id,
                "experiment_name"
            ].values[0]
            confirm = input(f"Did you mean '{experiment_name}'? (y/n): ")
            if confirm.lower() != "y":
                print("Please restart and enter the correct Experiment ID.")
                logging.info("User did not confirm the Experiment ID.")
                return
        except (ValueError, IndexError):
            print("Invalid input. Please enter a valid numerical ID.")
            logging.error("Invalid Experiment ID entered.")
            return
        
        experiments = [(experiment_id, control_system_id)]
    else:
        experiments = list(control_systems_df[
            control_systems_df["control_system_id"] == control_system_id
        ][['experiment_id', 'control_system_id']].itertuples(index=False, name=None))
    

    for experiment_id, control_system_id in experiments:
        # print(f"Processing Experiment ID {experiment_id} in Control System {control_system_id}...")
        logging.info("Processing Experiment ID %s in Control System %s", experiment_id, control_system_id)
        logging.info("The program is getting the plant_table,experiment_parameters")
        try:
            plant_table_df = get_plant_table(headers, experiment_id, control_system_id, return_df=True)
            PLANTS_ID = plant_table_df["ID"].tolist()
            PLANTS_ID_DICT = dict(zip(plant_table_df["ID"], plant_table_df["Name"]))
        except Exception as e:
            print(f"Error fetching plant table: {e}")
            logging.error("Error fetching plant table for Experiment ID %s: %s", experiment_id, e)
            continue

        # Fetch experiment parameters
        try:
            experiment_params_df = get_experiment_parameters(headers, experiment_id, control_system_id, return_df=True)
            PARAMETERS = experiment_params_df["Value"].tolist()
            PARAMETERS_TO_NAME = dict(zip(experiment_params_df["Value"], experiment_params_df["Name"]))
            PARAMETERS_TO_CATEGORY = dict(zip(experiment_params_df["Value"], experiment_params_df["Category"]))
            print("Experiment parameters retrieved.")
            logging.info("Experiment parameters retrieved for Experiment ID %s", experiment_id)
        except Exception as e:
            print(f"Error fetching experiment parameters: {e}")
            logging.error("Error fetching experiment parameters for Experiment ID %s: %s", experiment_id, e)
            continue

        # Get start and end times from the control systems dataframe
        start_time_val = control_systems_df[
            (control_systems_df.control_system_id == control_system_id) & 
            (control_systems_df.experiment_id == experiment_id)
        ]["start_time"].values[0]
        start_time_modified = pd.to_datetime(start_time_val).strftime("%Y-%m-%d")

        end_time_val = control_systems_df[
            (control_systems_df.control_system_id == control_system_id) &
            (control_systems_df.experiment_id == experiment_id)
        ]["end_time"].values[0]
        if pd.isna(end_time_val):
            end_time_val = pd.Timestamp.now().strftime("%Y-%m-%d")
        end_time = pd.to_datetime(end_time_val).strftime("%Y-%m-%d") 

        # Write message stating the experiment details.
        log_msg = f"Fetching data for Experiment ID {experiment_id} in Control System {control_system_id} from {start_time_modified} to {end_time}..."
        print(log_msg)
        logging.info(log_msg)
        
        # Ask user if they want to modify the start and end time
        modify_time = input("Do you want to modify the start and end time? (y/n): ")
        if modify_time.lower() == 'y':
            try:
                user_start_time = input(f"Enter the start time (current: {start_time_modified}, format: YYYY-MM-DD): ")
                user_end_time = input(f"Enter the end time (current: {end_time}, format: YYYY-MM-DD): ")
            
                # Validate the date format
                pd.to_datetime(user_start_time, format="%Y-%m-%d")
                pd.to_datetime(user_end_time, format="%Y-%m-%d")
                
                start_time_modified = user_start_time
                end_time = user_end_time
                logging.info("User modified time range to: %s - %s", start_time_modified, end_time)
            except ValueError:
                print("Invalid date format. Please use YYYY-MM-DD.")
                logging.error("User provided invalid date format.")
                return

        for idx, params in enumerate(PARAMETERS):
            safe_name = PARAMETERS_TO_NAME[params].replace("/", "_")
            logging.info("Requesting data for %s", safe_name)
            url = build_url(experiment_id, control_system_id, start_time_modified, end_time, PLANTS_ID, params)
            json_data = make_request(url, headers)
            time.sleep(1.5) # Sleep for 1.5 seconds to avoid rate limiting

            if json_data:
                # file_name = f"{FILES[idx] if idx < len(FILES) else f'{safe_name}.csv'}"
                # save file name without "\" replaced to "_"
                
                if any(FILES):
                    file_name = f"{FILES[idx] if idx < len(FILES) else f'{ PARAMETERS_TO_NAME[params]}.csv'}"
                    file_name = file_name.replace("/", "_")
                else:
                    file_name = f"{safe_name}.csv"

                process_and_save_data(
                    json_data=json_data, 
                    params_list=params, 
                    plants=PLANTS_ID, 
                    file_name=file_name, 
                    PLANTS_ID_DICT=PLANTS_ID_DICT, 
                    headers=headers, 
                    experiment_id=experiment_id, 
                    control_system_id=control_system_id,
                    category=PARAMETERS_TO_CATEGORY[params]
                )
                logging.info("Data processed and saved to %s", file_name)
    

if __name__ == "__main__":
    main()
4