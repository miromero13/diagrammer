package backend.users.controller;
import backend.common.annotation.RequirePermission;
import backend.common.constants.PermissionConstants;
import backend.common.utils.ResponseMessage;
import backend.users.dto.CreateUserDto;
import backend.users.dto.UpdateUserDto;
import backend.users.entity.UserEntity;
import backend.users.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/users")
@Tag(name = "Users", description = "API for managing users")
public class UserController {

    @Autowired
    private UserService userService;

    @RequirePermission(PermissionConstants.CREAR_USUARIO)
    @Operation()
    @PostMapping
    public ResponseMessage<UserEntity> createUser(@Valid @RequestBody CreateUserDto createUserDto) {
        return userService.createUser(createUserDto);
    }

    @RequirePermission(PermissionConstants.EDITAR_USUARIO)
    @Operation()
    @PutMapping("/{id}")
    public ResponseMessage<UserEntity> updateUser(@PathVariable UUID id, @Valid @RequestBody UpdateUserDto updateUserDto) {
        return userService.updateUser(id, updateUserDto);
    }

    @RequirePermission(PermissionConstants.LISTAR_USUARIO)
    @Operation()
    @GetMapping("/{id}")
    public ResponseMessage<UserEntity> getUserById(@PathVariable UUID id) {
        return userService.getUserById(id);
    }

    @RequirePermission(PermissionConstants.ELIMINAR_USUARIO)
    @Operation()
    @DeleteMapping("/{id}")
    public ResponseMessage<Void> deleteUser(@PathVariable UUID id) {
        return userService.deleteUser(id);
    }

    @RequirePermission(PermissionConstants.LISTAR_USUARIO)
    @Operation()
    @GetMapping
    public ResponseMessage<List<UserEntity>> getAllUsers() {
        return userService.getAllUsers();
    }
}
